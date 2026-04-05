import "dotenv/config";
import { readFileSync, accessSync, constants, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
import TelegramBot from "node-telegram-bot-api";
import { prisma } from "../src/lib/prisma";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set. Add it to .env");
}

const AGENT_PORT = process.env.AGENT_PORT ?? "3140";
const AGENT_API_KEY = process.env.AGENT_API_KEY;
const APP_BASE_URL = (() => {
  const url = process.env.APP_BASE_URL?.trim();
  if (url) return url;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "APP_BASE_URL is required in production. Add it to .env (e.g. https://your-domain.ru) to avoid API requests to localhost."
    );
  }
  return "http://127.0.0.1:3000";
})();

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

let consecutiveErrors = 0;

bot.on("polling_error", (err: Error & { code?: string }) => {
  if (err.code === "ETELEGRAM" && String(err.message).includes("409")) {
    // eslint-disable-next-line no-console
    console.error(
      "[bot] 409 Conflict: токен занят другим процессом. Завершение через 10 с (pm2 перезапустит с backoff)…"
    );
    bot.stopPolling().catch(() => {});
    setTimeout(() => process.exit(1), 10_000);
    return;
  }
  consecutiveErrors++;
  // eslint-disable-next-line no-console
  console.error(`[bot] polling_error (${consecutiveErrors}):`, err.message);
});

(async () => {
  try {
    await bot.deleteWebhook({ drop_pending_updates: false });
    // eslint-disable-next-line no-console
    console.log("[bot] Webhook cleared, starting polling…");
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[bot] deleteWebhook failed:", e instanceof Error ? e.message : e);
  }
  bot.startPolling();
  // eslint-disable-next-line no-console
  console.log("[bot] Bot polling started");
})();

function chunkMessage(text: string, limit = 4096): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let idx = remaining.lastIndexOf("\n", limit);
    if (idx <= 0) idx = limit;
    chunks.push(remaining.slice(0, idx));
    remaining = remaining.slice(idx);
  }
  if (remaining.trim().length > 0) chunks.push(remaining);
  return chunks;
}

type ResultSegment = { type: "text"; content: string } | { type: "image"; urlOrPath: string };

/** Разбирает результат агента на сегменты: текст и URL/пути картинок (![alt](url)). */
function parseResultSegments(result: string): ResultSegment[] {
  const segments: ResultSegment[] = [];
  const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(result)) !== null) {
    const before = result.slice(lastIndex, m.index).trim();
    if (before) segments.push({ type: "text", content: before });
    segments.push({ type: "image", urlOrPath: m[2] });
    lastIndex = m.index + m[0].length;
  }
  const after = result.slice(lastIndex).trim();
  if (after) segments.push({ type: "text", content: after });
  if (segments.length === 0 && result.trim()) segments.push({ type: "text", content: result.trim() });
  return segments;
}

/** Отправляет сегменты в Telegram: текст — sendMessage, картинки — sendPhoto. */
async function sendResultSegments(
  chatId: number,
  segments: ResultSegment[],
  replyMarkup?: TelegramBot.ReplyKeyboardMarkup
): Promise<void> {
  const baseUrl = APP_BASE_URL.replace(/\/$/, "");
  const isPublicUrl = baseUrl.startsWith("https://") && !baseUrl.includes("127.0.0.1") && !baseUrl.includes("localhost");

  const opts = (isLast: boolean) => (isLast && replyMarkup ? { reply_markup: replyMarkup } : {});
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const isLastSeg = i === segments.length - 1;
    if (seg.type === "text") {
      const chunks = chunkMessage(seg.content, 4096);
      for (let j = 0; j < chunks.length; j++) {
        const isLast = isLastSeg && j === chunks.length - 1;
        await bot.sendMessage(chatId, chunks[j]!, opts(isLast));
      }
    } else {
      const urlOrPath = seg.urlOrPath;
      try {
        const agentImgMatch = urlOrPath.match(/^\/(?:api\/)?uploads\/agent\/([a-zA-Z0-9._-]+)$/);
        if (agentImgMatch) {
          const filename = agentImgMatch[1];
          const localPath = join(process.cwd(), "public", "uploads", "agent", filename);
          let localExists = false;
          try {
            accessSync(localPath, constants.F_OK);
            localExists = true;
          } catch {
            /* file not found */
          }
          if (localExists) {
            const buf = readFileSync(localPath);
            await bot.sendPhoto(chatId, buf, { ...opts(isLastSeg) }, { filename });
          } else if (isPublicUrl) {
            await bot.sendPhoto(chatId, `${baseUrl}/api/uploads/agent/${filename}`, opts(isLastSeg));
          } else {
            await bot.sendMessage(chatId, `🖼 [Картинка: ${filename}]`, opts(isLastSeg));
          }
        } else if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
          await bot.sendPhoto(chatId, urlOrPath, opts(isLastSeg));
        } else if (urlOrPath.startsWith("data:image/")) {
          const base64Match = urlOrPath.match(/^data:image\/([^;]+);base64,(.+)$/);
          if (base64Match) {
            const ext = base64Match[1] === "jpeg" ? "jpg" : base64Match[1];
            const buf = Buffer.from(base64Match[2], "base64");
            await bot.sendPhoto(chatId, { source: buf, filename: `image.${ext}` } as TelegramBot.InputFile, opts(isLastSeg));
          } else {
            await bot.sendMessage(chatId, "⚠ Не удалось декодировать изображение.", opts(isLastSeg));
          }
        } else {
          await bot.sendMessage(chatId, `🖼 [Изображение: ${urlOrPath.slice(0, 50)}…]`, opts(isLastSeg));
        }
      } catch {
        await bot.sendMessage(chatId, `⚠ Не удалось отправить изображение: ${urlOrPath}`, opts(isLastSeg));
      }
    }
  }
}

type StepItem = {
  type: string;
  text: string;
  detail?: string;
  requestSummary?: string;
  toolName?: string;
  toolArgs?: string;
  toolResultSummary?: string;
  success?: boolean;
};

function formatSteps(steps: StepItem[]): string {
  if (steps.length === 0) return "";
  const lines = steps.map((s) => {
    const icon = s.type === "llm" ? "●" : s.type === "tool" ? "◆" : "✓";
    let line = `${icon} ${s.text}`;
    if (s.detail) line += ` — ${s.detail}`;
    if (s.type === "tool") {
      if (s.success === true) line += " ✓";
      if (s.success === false) line += " ✗";
    }
    if (s.requestSummary) line += `\n   📝 ${s.requestSummary}`;
    if (s.toolName) line += `\n   Инструмент: ${s.toolName}`;
    if (s.toolArgs && s.toolArgs.length > 2 && s.toolArgs.length < 200) line += `\n   Аргументы: ${s.toolArgs}`;
    if (s.toolArgs && s.toolArgs.length >= 200) line += `\n   Аргументы: ${s.toolArgs.slice(0, 180)}…`;
    if (s.toolResultSummary) line += `\n   → ${s.toolResultSummary}`;
    return line;
  });
  return "🤖 Ход выполнения:\n\n" + lines.join("\n\n");
}

const TELEGRAM_AUTH_HEADERS = {
  Authorization: `Bearer ${process.env.TELEGRAM_BOT_TOKEN}`,
};

const BTN_MODEL = "🤖 Модель ИИ";
const BTN_LAST_LOG = "📋 Последний ход";

type BotContext = {
  projectLabel: string;
  modeButtonLabel: string;
  models: Array<{ id: string; name: string }>;
  modelName: string;
  mode: string;
  modeLabel: string;
  project: string;
  projects: string[];
};

async function fetchBotContext(): Promise<BotContext | null> {
  try {
    const res = await fetch(`${APP_BASE_URL}/api/telegram/bot-context`, {
      headers: TELEGRAM_AUTH_HEADERS,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as BotContext;
    return data;
  } catch {
    return null;
  }
}

function buildReplyKeyboard(ctx: BotContext | null): TelegramBot.ReplyKeyboardMarkup {
  const projectBtn = "📁 Проект";
  const modeBtn = "⚙️ Режим";
  return {
    keyboard: [
      [{ text: BTN_MODEL }, { text: projectBtn }, { text: modeBtn }],
      [{ text: BTN_LAST_LOG }],
    ],
    resize_keyboard: true,
    persistent: true,
    one_time_keyboard: false,
  };
}

/** Конфиг агента: модель и режим. */
type AgentConfig = { model: string; baseUrl?: string; apiKey?: string; mode: "chat" | "consult" | "dev" } | null;

/** Получить выбранную модель и режим из админки (для использования агентом). */
async function fetchAgentConfig(): Promise<AgentConfig> {
  try {
    const res = await fetch(`${APP_BASE_URL}/api/agent/selected-model`, {
      headers: AGENT_API_KEY ? { Authorization: `Bearer ${AGENT_API_KEY}` } : {},
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { model?: string | null; baseUrl?: string; apiKey?: string; mode?: string };
    const mode = data.mode === "chat" || data.mode === "consult" || data.mode === "dev" ? data.mode : "consult";
    if (!data.model) {
      return { model: "", baseUrl: undefined, apiKey: undefined, mode };
    }
    return {
      model: data.model,
      baseUrl: data.baseUrl ?? undefined,
      apiKey: data.apiKey ?? undefined,
      mode,
    };
  } catch {
    return null;
  }
}

/** Только модель (для обратной совместимости). */
function configToModelOverride(cfg: AgentConfig): { model: string; baseUrl?: string; apiKey?: string } | null {
  if (!cfg?.model) return null;
  return { model: cfg.model, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey };
}

/** Список моделей и выбранная (для /model). */
async function fetchAgentModelsList(): Promise<{ models: Array<{ id: string; name: string }>; selected: string | null } | null> {
  try {
    const res = await fetch(`${APP_BASE_URL}/api/telegram/agent-models`, {
      headers: TELEGRAM_AUTH_HEADERS,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { models?: Array<{ id: string; name: string }>; selected?: string | null };
    return {
      models: data.models ?? [],
      selected: data.selected ?? null,
    };
  } catch {
    return null;
  }
}

/** Текущий режим (для /mode). */
async function fetchAgentMode(): Promise<{ mode: string; label: string } | null> {
  try {
    const res = await fetch(`${APP_BASE_URL}/api/telegram/agent-mode`, { headers: TELEGRAM_AUTH_HEADERS });
    if (!res.ok) return null;
    const data = (await res.json()) as { mode?: string; label?: string };
    return { mode: data.mode ?? "consult", label: data.label ?? "Консультация" };
  } catch {
    return null;
  }
}

/** Установить режим (вызов из бота по callback). */
async function setModeFromTelegram(mode: string, telegramId: number): Promise<{ ok: boolean; label?: string; error?: string }> {
  try {
    const res = await fetch(`${APP_BASE_URL}/api/telegram/set-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...TELEGRAM_AUTH_HEADERS },
      body: JSON.stringify({ mode, telegram_id: telegramId }),
    });
    const data = (await res.json()) as { ok?: boolean; label?: string; error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    return { ok: true, label: data.label };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

/** Установить модель (вызов из бота по callback). */
async function setModelFromTelegram(model: string, telegramId: number): Promise<{ ok: boolean; displayName?: string; error?: string }> {
  try {
    const res = await fetch(`${APP_BASE_URL}/api/telegram/set-model`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...TELEGRAM_AUTH_HEADERS },
      body: JSON.stringify({ model: model === "__env__" ? null : model, telegram_id: telegramId }),
    });
    const data = (await res.json()) as { ok?: boolean; displayName?: string; error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    return { ok: true, displayName: data.displayName };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

/** Вызов агента со стримингом шагов. Возвращает { result, steps } или выбрасывает. */
async function callAgentWithSteps(
  prompt: string,
  mode: "chat" | "consult" | "dev",
  onStep: (steps: StepItem[], formatted: string) => void,
  modelOverride?: { model: string; baseUrl?: string; apiKey?: string } | null,
  meta?: { userAccount?: string; chatName?: string },
  inputImages?: string[]
): Promise<{ result: string; steps: StepItem[] }> {
  const url = `http://127.0.0.1:${AGENT_PORT}/run?stream=1`;
  const body: Record<string, unknown> = {
    prompt,
    mode,
    project: "Комиссионка",
    environment: "telegram",
    ...(meta?.userAccount ? { userAccount: meta.userAccount } : {}),
    ...(meta?.chatName ? { chatName: meta.chatName } : {}),
    ...(inputImages && inputImages.length ? { inputImages } : {}),
  };
  if (modelOverride) {
    body.model = modelOverride.model;
    body.baseUrl = modelOverride.baseUrl;
    body.apiKey = modelOverride.apiKey;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(AGENT_API_KEY ? { Authorization: `Bearer ${AGENT_API_KEY}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Agent error ${res.status}: ${text.slice(0, 200)}`);
  }

  const steps: StepItem[] = [];
  let result = "";
  const decoder = new TextDecoder();
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  let buffer = "";
  let eventType = "";
  const EDIT_THROTTLE_MS = 1500;
  let lastEditAt = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("event: ")) eventType = line.slice(7).trim();
      else if (line.startsWith("data: ") && eventType) {
        try {
          const data = JSON.parse(line.slice(6)) as unknown;
          if (eventType === "step") {
            const step = data as StepItem;
            steps.push(step);
            const now = Date.now();
            if (now - lastEditAt >= EDIT_THROTTLE_MS || steps.length <= 2) {
              lastEditAt = now;
              onStep(steps, formatSteps(steps));
            }
          } else if (eventType === "done") {
            const d = data as { result?: string };
            result = d.result ?? "";
          } else if (eventType === "error") {
            const d = data as { error?: string };
            throw new Error(d.error ?? "Agent error");
          }
        } catch (e) {
          if (e instanceof SyntaxError) {
            // пропускаем невалидные data-строки
          } else {
            throw e;
          }
        }
        eventType = "";
      }
    }
  }

  if (!result) throw new Error("Agent returned empty result");
  return { result, steps };
}

async function bindTelegramByCode(opts: {
  code: string;
  telegramId: number;
  telegramUsername?: string;
}): Promise<string> {
  const res = await fetch(`${APP_BASE_URL}/api/telegram/bind`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TELEGRAM_BOT_TOKEN}`,
    },
    body: JSON.stringify({
      code: opts.code,
      telegram_id: opts.telegramId,
      telegram_username: opts.telegramUsername ?? null,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data && (data.error as string)) || `HTTP ${res.status}`);
  }
  return (data && (data.message as string)) || "Telegram привязан.";
}

async function downloadPhotoAsDataUrl(fileId: string): Promise<string | null> {
  try {
    const file = await bot.getFile(fileId);
    if (!file.file_path) return null;
    const url = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    if (buf.length === 0) return null;
    const base64 = buf.toString("base64");
    // Telegram photo обычно jpeg
    const mimeType = "image/jpeg";
    return `data:${mimeType};base64,${base64}`;
  } catch {
    return null;
  }
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const from = msg.from;
  const text = msg.text?.trim();
  const hasPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;
  const caption = msg.caption?.trim();

  if (!from) {
    return;
  }

  // Проверка прав: telegram_id привязан и role = admin
  const profile = await prisma.profiles.findFirst({
    where: { telegram_id: String(from.id), role: "admin" },
    select: { id: true, full_name: true, email: true, role: true },
  });

  // /start и /help — только для текстовых сообщений
  if (text === "/start" || text === "/help") {
    const welcomeText = [
      "👋 Бот «Спринт Комиссионки».",
      "",
      "1) Войдите в админку Комиссионки под своим аккаунтом-админом.",
      "2) В блоке «Telegram для админа» нажмите «Привязать Telegram» и получите код вида КОМ-XXXXXX.",
      "3) Отправьте мне сообщение: КОМ-XXXXXX — я привяжу ваш Telegram к профилю-админу.",
      "",
      "После привязки пишите промпты — я выполню их через локального агента. Кнопки ниже для смены модели, проекта и режима.",
    ].join("\n");
    if (profile) {
      const ctx = await fetchBotContext();
      await bot.sendMessage(chatId, welcomeText, { reply_markup: buildReplyKeyboard(ctx) });
    } else {
      await bot.sendMessage(chatId, welcomeText);
    }
    return;
  }

  const ctx = profile ? await fetchBotContext() : null;
  const isModeButton = text === "⚙️ Режим" || text === "Курилка" || text === "Консультация" || text?.includes("Разработка");
  const isProjectButton = text === "📁 Проект" || text?.startsWith("📁 ");

  if (profile && (text === BTN_MODEL || text === "/model")) {
    try {
      const list = await fetchAgentModelsList();
      if (!list) {
        await bot.sendMessage(chatId, "Не удалось получить список моделей. Проверьте, что приложение запущено.");
        return;
      }
      const currentModel = list.selected ? list.models.find((m) => m.id === list.selected) : null;
      const currentName = currentModel
        ? `${(currentModel as { typeIcon?: string }).typeIcon ?? "📝"} ${currentModel.name}`
        : "из .env (по умолчанию)";
      const rows: TelegramBot.InlineKeyboardButton[][] = [];
      rows.push([{ text: "📌 Из .env (по умолчанию)", callback_data: "m:__env__" }]);
      const perRow = 2;
      for (let i = 0; i < list.models.length; i += perRow) {
        const chunk = list.models.slice(i, i + perRow).map((m) => {
          const icon = (m as { typeIcon?: string }).typeIcon ?? "📝";
          const label = `${icon} ${m.name?.slice(0, 26) ?? m.id}`;
          return {
            text: (list.selected === m.id ? "✓ " : "") + label,
            callback_data: "m:" + m.id,
          };
        });
        rows.push(chunk);
      }
      await bot.sendMessage(chatId, `📋 Текущая модель: ${currentName}\n\nВыберите модель:`, {
        reply_markup: { inline_keyboard: rows },
        reply_to_message_id: msg.message_id,
      });
    } catch {
      await bot.sendMessage(chatId, "Не удалось получить список моделей. Проверьте, что приложение запущено.");
    }
    return;
  }

  if (profile && (text === "/mode" || isModeButton)) {
    try {
      const current = await fetchAgentMode();
      if (!current) {
        await bot.sendMessage(chatId, "Не удалось получить режим. Проверьте, что приложение запущено.");
        return;
      }
      const devWarning = "\n• ⚠️ Разработка — ВНИМАНИЕ! Прямой доступ к коду, требуется подтверждение";
      await bot.sendMessage(
        chatId,
        `⚙️ Текущий режим: ${current.label}\n\n` +
          "• Курилка — чат без доступа к коду\n• Консультация — чтение кода, без правок" +
          devWarning +
          "\n\nВыберите:",
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: (current.mode === "chat" ? "✓ " : "") + "Курилка", callback_data: "mode:chat" },
                { text: (current.mode === "consult" ? "✓ " : "") + "Консультация", callback_data: "mode:consult" },
              ],
              [{ text: (current.mode === "dev" ? "✓ " : "") + "⚠️ Разработка!", callback_data: "mode:dev" }],
            ],
          },
        }
      );
    } catch {
      await bot.sendMessage(chatId, "Не удалось получить режим. Проверьте, что приложение запущено.");
    }
    return;
  }

  if (profile && isProjectButton) {
    const projects = ctx?.projects ?? ["Комиссионка"];
    const currentProject = ctx?.project ?? "Комиссионка";
    const rows: TelegramBot.InlineKeyboardButton[][] = projects.map((p) => [
      { text: p === currentProject ? "✓ " + p : p, callback_data: "proj:" + p },
    ]);
    await bot.sendMessage(
      chatId,
      `📁 Текущий проект: ${currentProject}\n\nВыберите проект:`,
      { reply_markup: { inline_keyboard: rows } }
    );
    return;
  }

  if (profile && (text === BTN_LAST_LOG || text === "/log")) {
    let buf: Buffer | null = null;
    try {
      const res = await fetch(`${APP_BASE_URL}/api/telegram/agent-log`, {
        headers: { Authorization: `Bearer ${TELEGRAM_BOT_TOKEN}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if ((data as { empty?: boolean }).empty) {
          await bot.sendMessage(chatId, "📋 Лог рассуждений пока пуст. Выполните запрос к агенту.");
          return;
        }
        throw new Error(`API ${res.status}`);
      }
      buf = Buffer.from(await res.arrayBuffer());
    } catch (fetchErr) {
      const roots = [PROJECT_ROOT, process.cwd()];
      for (const root of roots) {
        const logPath = join(root, ".agent-logs", "last-reasoning.txt");
        if (existsSync(logPath)) {
          try {
            buf = readFileSync(logPath);
            break;
          } catch (readErr) {
            // eslint-disable-next-line no-console
            console.error("[bot] Ошибка чтения лога:", readErr);
          }
        }
      }
      if (!buf) {
        await bot.sendMessage(
          chatId,
          "📋 Лог рассуждений пока пуст. Выполните запрос к агенту (админка или бот), затем повторите."
        );
        return;
      }
    }
    if (!buf || buf.length === 0) {
      await bot.sendMessage(chatId, "📋 Лог рассуждений пуст.");
      return;
    }
    const logPathForSend = join(tmpdir(), `agent-log-${Date.now()}.txt`);
    try {
      writeFileSync(logPathForSend, buf, "utf-8");
      await bot.sendDocument(chatId, logPathForSend, {
        caption: "📋 Последний ход рассуждений ИИ",
      });
    } catch (sendErr) {
      const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      // eslint-disable-next-line no-console
      console.error("[bot] Ошибка отправки лога в Telegram:", msg);
      await bot.sendMessage(
        chatId,
        `Не удалось отправить файл лога: ${msg}. Возможно, лог слишком большой (лимит Telegram ~50 МБ).`
      );
    } finally {
      try {
        unlinkSync(logPathForSend);
      } catch {
        // ignore
      }
    }
    return;
  }

  // Сообщение с кодом привязки вида КОМ-XXXXXX
  const codeMatch = text?.match(/КОМ-[0-9A-Z]{4,}/i);
  if (codeMatch) {
    const code = codeMatch[0].toUpperCase();
    try {
      await bot.sendMessage(chatId, `Пытаюсь привязать код ${code}…`);
      const message = await bindTelegramByCode({
        code,
        telegramId: from.id,
        telegramUsername: from.username ?? undefined,
      });
      const bindCtx = await fetchBotContext();
      await bot.sendMessage(chatId, `✅ ${message}`, { reply_markup: buildReplyKeyboard(bindCtx) });
    } catch (e) {
      const msgErr = e instanceof Error ? e.message : String(e);
      await bot.sendMessage(
        chatId,
        `❌ Не удалось привязать Telegram по коду ${code}.\nСообщение: ${msgErr}`
      );
    }
    return;
  }

  // Ни текста, ни фото — ничего не делаем
  if (!profile && !hasPhoto && !text) {
    return;
  }

  if (!profile) {
    await bot.sendMessage(
      chatId,
      "Доступ только для администраторов Комиссионки.\n" +
        "Зайдите в админку, привяжите Telegram в блоке «Telegram для админа», затем повторите запрос."
    );
    return;
  }

  // Обработка промпта через локального агента (с ходом выполнения как в админке)
  let stepsMsg: { message_id: number } | null = null;
  try {
    stepsMsg = await bot.sendMessage(chatId, "🤖 Обрабатываю промпт через агента…");

    const config = await fetchAgentConfig();
    const modelOverride = configToModelOverride(config);
    const mode = config?.mode ?? "consult";

    // Подготовка входных картинок (если есть)
    let inputImages: string[] | undefined;
    if (hasPhoto) {
      const photos = msg.photo!;
      const largest = photos[photos.length - 1]!;
      const dataUrl = await downloadPhotoAsDataUrl(largest.file_id);
      if (dataUrl) {
        inputImages = [dataUrl];
      }
    }

    const userPrompt =
      text ||
      caption ||
      (hasPhoto ? "Проанализируй вложенное изображение, присланное пользователем." : "");

    if (!userPrompt) {
      await bot.sendMessage(chatId, "Пустой запрос. Добавьте текст или подпись к изображению.");
      return;
    }

    const { result, steps } = await callAgentWithSteps(
      userPrompt,
      mode,
      async (stepsArr, formatted) => {
        if (stepsMsg && formatted.length <= 4000) {
          try {
            await bot.editMessageText(formatted, {
              chat_id: chatId,
              message_id: stepsMsg.message_id,
            });
          } catch {
            // игнорируем ошибки редактирования (лимиты Telegram)
          }
        }
      },
      modelOverride,
      {
        userAccount: profile.id,
        chatName: `telegram:${chatId}`,
      },
      inputImages
    );

    // Финальное обновление сообщения: ход выполнения + кратко «Готово»
    if (stepsMsg && steps.length > 0) {
      const fullSteps = formatSteps(steps);
      const finalText = fullSteps.length <= 4000 ? fullSteps + "\n\n✅ Готово." : "✅ Готово.";
      try {
        await bot.editMessageText(finalText, {
          chat_id: chatId,
          message_id: stepsMsg.message_id,
        });
      } catch {
        // игнорируем
      }
    } else if (stepsMsg) {
      try {
        await bot.editMessageText("✅ Готово.", {
          chat_id: chatId,
          message_id: stepsMsg.message_id,
        });
      } catch {
        // игнорируем
      }
    }

    const segments = parseResultSegments(result);
    if (segments.length === 0) {
      const kbdCtx = await fetchBotContext();
      await bot.sendMessage(chatId, "Агент вернул пустой результат.", { reply_markup: buildReplyKeyboard(kbdCtx) });
      return;
    }
    const kbdCtx = await fetchBotContext();
    await sendResultSegments(chatId, segments, buildReplyKeyboard(kbdCtx));
  } catch (e) {
    const msgErr = e instanceof Error ? e.message : String(e);
    const errCtx = await fetchBotContext();
    const errKb = buildReplyKeyboard(errCtx);
    // Не редактируем stepsMsg — сохраняем ход выполнения и вывод. Ошибку отправляем отдельным сообщением.
    await bot.sendMessage(
      chatId,
      `❌ Ошибка при вызове агента:\n${msgErr}\n\nУбедитесь, что запущен агент (npm run agent:serve) и доступен порт ${AGENT_PORT}. Лог: .agent-logs или кнопка в админке.`,
      { reply_markup: errKb }
    );
  }
});

bot.on("callback_query", async (query) => {
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  const from = query.from;
  const data = query.data;

  if (!from || !chatId || !data || messageId == null) return;

  const profile = await prisma.profiles.findFirst({
    where: { telegram_id: String(from.id), role: "admin" },
    select: { id: true },
  });
  if (!profile) {
    await bot.answerCallbackQuery(query.id, { text: "Только для администраторов" });
    return;
  }

  if (data.startsWith("mode:")) {
    const modeId = data.slice(5);
    const result = await setModeFromTelegram(modeId, from.id);
    if (result.ok) {
      await bot.answerCallbackQuery(query.id, { text: `Режим: ${result.label ?? modeId}` });
      const cbCtx = await fetchBotContext();
      const kb = buildReplyKeyboard(cbCtx);
      try {
        await bot.deleteMessage(chatId, messageId);
      } catch {
        /* ignore */
      }
      await bot.sendMessage(chatId, `✅ Режим установлен: ${result.label ?? modeId}`, { reply_markup: kb });
    } else {
      await bot.answerCallbackQuery(query.id, { text: result.error ?? "Ошибка", show_alert: true });
      try {
        await bot.editMessageText(`❌ ${result.error ?? "Не удалось сменить режим"}`, {
          chat_id: chatId,
          message_id: messageId,
        });
      } catch {
        await bot.sendMessage(chatId, `❌ ${result.error ?? "Не удалось сменить режим"}`);
      }
    }
    return;
  }

  if (data.startsWith("proj:")) {
    const projectName = data.slice(5);
    await bot.answerCallbackQuery(query.id, { text: `Проект: ${projectName}` });
    const cbCtx = await fetchBotContext();
    await bot.sendMessage(chatId, `✅ Проект: ${projectName}`, { reply_markup: buildReplyKeyboard(cbCtx) });
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch {
      /* ignore */
    }
    return;
  }

  if (!data.startsWith("m:")) return;

  const modelId = data.slice(2);
  const result = await setModelFromTelegram(modelId, from.id);

  if (result.ok) {
    await bot.answerCallbackQuery(query.id, { text: `Модель: ${result.displayName ?? modelId === "__env__" ? "из .env" : modelId}` });
    const cbCtx = await fetchBotContext();
    const kb = buildReplyKeyboard(cbCtx);
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch {
      /* ignore */
    }
    await bot.sendMessage(chatId, `✅ Модель установлена: ${result.displayName ?? "из .env (по умолчанию)"}`, { reply_markup: kb });
  } else {
    await bot.answerCallbackQuery(query.id, { text: result.error ?? "Ошибка", show_alert: true });
    try {
      await bot.editMessageText(`❌ ${result.error ?? "Не удалось сменить модель"}`, {
        chat_id: chatId,
        message_id: messageId,
      });
    } catch {
      await bot.sendMessage(chatId, `❌ ${result.error ?? "Не удалось сменить модель"}`);
    }
  }
});

process.on("SIGINT", () => {
  bot.stopPolling()
    .then(() => {
      // eslint-disable-next-line no-console
      console.log("Bot stopped");
      process.exit(0);
    })
    .catch(() => process.exit(1));
});

