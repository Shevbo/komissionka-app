/**
 * Ядро агента (Этап 3.3–3.4): цикл «промпт → LLM → инструменты → ответ» с таймаутом и лимитом шагов.
 * Собирает главные события (steps) и полный лог рассуждений (logEntries) для отображения и сохранения в файл.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { replaceDataUrlsWithFiles } from "./image-dataurl-to-file.js";
import { request } from "./llm/index.js";
import type { ChatMessage } from "./llm/index.js";
import type { AgentMode } from "./llm/system-prompt.js";
import { getSystemPrompt, getSystemPromptForChat } from "./llm/system-prompt.js";
import { getConfig } from "./config.js";
import { parseModelIdWithModality, shouldRequestImageOutput, isOpenRouterModelId } from "./lib/model-utils.js";
import { TOOLS_FOR_LLM, TOOLS_CHAT, TOOLS_CONSULT, executeTool, RUN_COMMAND_DISALLOWED_PREFIX } from "./tools/index.js";
import { buildReportFooter, readVersions, countWordsForFooter, stripAgentReportFooter } from "./lib/report-footer.js";
import { getServicesStatus } from "./lib/services-status.js";

const MAX_TOOL_ITERATIONS = 70;

/** Максимум реплик истории (пар user/assistant). Передаём полный контекст чата в модель. */
const MAX_HISTORY_TURNS = 100;

/** Максимальная длина лога «Путь рассуждения» (символов); при превышении сохраняются последние символы. */
const MAX_REASONING_LOG_LENGTH = 2_000_000;

/** Макс. длина результата инструмента в логе (остальное заменяется на «…[обрезано]»). */
const MAX_TOOL_RESULT_IN_LOG = 15_000;

/** Макс. длина промпта/ответа в логе при дампе (для избежания переполнения). */
const MAX_DUMP_IN_LOG = 50_000;

const AGENT_LOGS_DIR = ".agent-logs";
const LAST_INPUT_FILE = "last-input.txt";

const LAST_OUTPUT_FILE = "last-output.txt";
/** Файл с последним ходом рассуждений (для бота и открытия из репозитория). */
const LAST_REASONING_FILE = "last-reasoning.txt";

export interface AgentStep {
  /** Тип: llm — запрос к модели, tool — вызов инструмента, done — ответ получен. */
  type: "llm" | "tool" | "done";
  /** Краткое описание (для панели хода выполнения). */
  text: string;
  /** Детали (имя инструмента, путь и т.д.). */
  detail?: string;
  /** Для llm: фрагмент запроса к модели (промпт или «итерация N»). */
  requestSummary?: string;
  /** Для tool: имя инструмента. */
  toolName?: string;
  /** Для tool: полные аргументы вызова (JSON). */
  toolArgs?: string;
  /** Для tool: краткий результат (OK / error / первые символы ответа). */
  toolResultSummary?: string;
  /** Для tool: признак успешного выполнения. */
  success?: boolean;
}

export interface RunAgentCoreResult {
  result: string;
  steps: AgentStep[];
  logEntries: string[];
}

export interface RunAgentCoreOptions {
  /** Вызывается при каждом новом шаге (для потоковой передачи в UI). */
  onStep?: (step: AgentStep) => void;
  /** Режим: chat — курилка (без контекста, только get_agent_info), consult — консультация (только чтение), dev — разработка (полный доступ). */
  mode?: AgentMode;
  /** Опционально: сюда пишем steps при каждом pushStep, чтобы при таймауте/ошибке снаружи можно было вернуть уже накопленные шаги. */
  stepsRef?: { current: AgentStep[] };
  /** Переопределение модели, baseUrl, apiKey (от администратора). */
  modelOverride?: { model: string; baseUrl?: string; apiKey?: string };
  /** Отображаемое имя модели (для префикса, совпадает с dropdown). */
  modelDisplayName?: string;
  /**
   * Входные изображения от клиента (админка, Telegram).
   * Каждый элемент — base64 (без data:-префикса) и MIME-типа.
   */
  inputImages?: Array<{ mimeType: string; data: string }>;
  /** Проект (например «Комиссионка»). Для подвала отчёта. */
  project?: string;
  /** Версии app/agent/tgbot из приложения — для подвала, чтобы совпадали с админкой. */
  footerVersions?: { app: string; agent: string; tgbot: string };
  /**
   * Принудительно отправить системный промпт в LLM.
   * Используется для force-fresh запросов (промпт с '!'), чтобы гарантировать актуальный контекст и правила инструментов.
   */
  forceSystemPrompt?: boolean;
}

/** Формат префикса ответа ИИ: "Модель [Режим] объём_опыта> " — защита от путаницы с моделями. */
function formatResponsePrefix(modelName: string, mode: AgentMode, historyTurnsCount: number, displayName?: string): string {
  const modeLetter = mode === "chat" ? "S" : mode === "consult" ? "A" : "D";
  const displayModel = displayName?.trim()
    ?? (modelName
      ? modelName
          .replace(/^models\//, "")
          .split(/[-/]/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(" ")
      : "ИИ");
  return `${displayModel} [${modeLetter}] ${historyTurnsCount}> `;
}

/** Убирает префиксы вида "Модель [S|A|D] N> " из начала текста (в т.ч. цепочку из истории). Экспортируется для contract. */
const PREFIX_PATTERN = /^([^[\n]+\[[SAD]\]\s*\d+>\s*)+/;
export function stripPrefixChain(text: string): string {
  return text.replace(PREFIX_PATTERN, "").trimStart();
}

/**
 * Выполняет один запрос к агенту: промпт → (LLM + вызовы инструментов) → финальный текст.
 * Собирает steps (главные события) и logEntries (полный лог). Вызывает onStep при каждом шаге для потокового вывода.
 */
export async function runAgentCore(
  prompt: string,
  history?: Array<{ role: "user" | "assistant"; content: string }>,
  options?: RunAgentCoreOptions
): Promise<RunAgentCoreResult> {
  const onStep = options?.onStep;
  const stepsRef = options?.stepsRef;
  const mode: AgentMode = options?.mode ?? "dev";
  const modelOverride = options?.modelOverride;
  const modelDisplayName = options?.modelDisplayName;
  const project = options?.project;
  const config = getConfig();
  let {
    root,
    llmApiKey,
    llmModel,
    llmBaseUrl,
    timeoutMs,
    maxOutputLength,
    contextFilePath,
    proxyUrl,
    proxyConnectTimeoutMs,
    thinkingLevel,
    toolResultMaxCharsInContext,
    historyTurnMaxChars,
    openRouterApiKey,
    openRouterBaseUrl,
  } = config;
  if (modelOverride) {
    llmModel = modelOverride.model;
    if (modelOverride.baseUrl) llmBaseUrl = modelOverride.baseUrl;
    if (modelOverride.apiKey !== undefined) llmApiKey = modelOverride.apiKey ?? undefined;
  }
  // Для Google‑моделей всегда используем официальный endpoint Gemini,
  // игнорируя любые AGENT_LLM_BASE_URL из окружения (во избежание cookie‑прокси).
  const isOpenRouterModelId = (id: string | undefined): boolean =>
    !!id && (id.startsWith("anthropic/") || id.toLowerCase().includes("claude"));
  if (llmModel && !isOpenRouterModelId(llmModel)) {
    llmBaseUrl = "https://generativelanguage.googleapis.com/v1beta/openai";
  }
  const agentInfo = llmModel ? { model: llmModel } : undefined;
  const systemPrompt =
    mode === "chat"
      ? getSystemPromptForChat(agentInfo)
      : getSystemPrompt(root, contextFilePath, agentInfo, mode);

  const steps: AgentStep[] = [];
  const logEntries: string[] = [];

  const historyTurns = Array.isArray(history)
    ? history.slice(-MAX_HISTORY_TURNS).filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
    : [];

  /** В режимах консультация/разработка системный промпт отправляем только при первом сообщении в чате; при последующих полагаемся на память модели. */
  const isFirstTurnInChat = historyTurns.length === 0;
  const lastAgentVersion =
    [...historyTurns]
      .reverse()
      .filter((t) => t.role === "assistant")
      .map((t) => t.content.match(/\bagent v(\d+\.\d+\.\d+)\b/i)?.[1] ?? null)
      .find((v) => !!v) ?? null;
  const currentAgentVersion = (options?.footerVersions ?? readVersions(root))?.agent ?? null;
  const shouldResendSystemPromptDueToVersion =
    !!currentAgentVersion && !!lastAgentVersion && currentAgentVersion !== lastAgentVersion;
  const sendSystemPrompt =
    mode === "chat"
      ? false
      : (mode === "consult" || mode === "dev")
        ? (options?.forceSystemPrompt === true || isFirstTurnInChat || shouldResendSystemPromptDueToVersion)
        : true;

  function appendLog(line: string): void {
    logEntries.push(`[${new Date().toISOString()}] ${line}`);
  }

  const prefix = (txt: string) => formatResponsePrefix(llmModel ?? "ИИ", mode, historyTurns.length, modelDisplayName) + txt;

  const versionsAtStart = options?.footerVersions ?? readVersions(root);
  const projectName = project ?? config.defaultProject;
  const displayModel = modelDisplayName?.trim() ?? (llmModel ? llmModel.replace(/^models\//, "").split(/[-/]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ") : "ИИ");

  function computeInputSize(msgs?: Array<{ content: string | unknown }>): { chars: number; words: number } {
    if (msgs && msgs.length > 0) {
      const chars = msgs.reduce((s, m) => s + (typeof m.content === "string" ? m.content.length : 0), 0);
      const text = msgs.map((m) => (typeof m.content === "string" ? m.content : "")).join(" ");
      return { chars, words: countWordsForFooter(text) };
    }
    const sysLen = mode === "chat" ? 0 : sendSystemPrompt ? systemPrompt.length : 0;
    return {
      chars: sysLen + prompt.length + historyTurns.reduce((s, t) => s + t.content.length, 0),
      words: (sysLen ? countWordsForFooter(systemPrompt) : 0) + countWordsForFooter(prompt) + historyTurns.reduce((s, t) => s + countWordsForFooter(t.content), 0),
    };
  }

  function runRestartThenGetStatus(): { app: boolean; agent: boolean; bot: boolean } | undefined {
    try {
      execSync("pm2 restart komissionka agent bot", { cwd: root, stdio: "pipe" });
    } catch {
      /* перезапуск мог завершиться с ошибкой — всё равно пытаемся получить статус */
    }
    return getServicesStatus(root);
  }

  function withFooter(
    withPrefix: string,
    outputText: string,
    hadMod: boolean,
    inputOverride?: { chars: number; words: number },
    servicesStatus?: { app: boolean; agent: boolean; bot: boolean }
  ): string {
    const { chars: inputChars, words: inputWords } = inputOverride ?? computeInputSize();
    const versionsAfter = hadMod ? readVersions(root) : versionsAtStart;
    return (
      withPrefix +
      buildReportFooter({
        model: displayModel,
        project: projectName,
        mode,
        inputChars,
        outputChars: outputText.length,
        inputWords,
        outputWords: countWordsForFooter(outputText),
        root,
        versionsBefore: versionsAtStart,
        versionsAfter,
        hadModifications: hadMod,
        servicesStatus,
      })
    );
  }

  function makeReturn(
    msg: string,
    hadMod = false,
    msgs?: Array<{ role: string; content: string | unknown; tool_calls?: unknown }>,
    servicesStatusOverride?: { app: boolean; agent: boolean; bot: boolean }
  ): RunAgentCoreResult {
    const inputOverride = msgs && msgs.length > 0 ? computeInputSize(msgs) : undefined;
    if (mode === "dev") {
      const inputSerialized = msgs && msgs.length > 0
        ? serializeMessagesForInput(msgs)
        : `--- SYSTEM ---\n${systemPrompt}\n\n--- HISTORY ---\n${historyTurns.map((t) => `[${t.role}]: ${t.content}`).join("\n\n")}\n\n--- PROMPT ---\n${prompt}`;
      writeLastInputOutput(root, inputSerialized, msg);
    }
    const servicesStatus =
      servicesStatusOverride ??
      (hadMod ? runRestartThenGetStatus() : getServicesStatus(root));
    return { result: withFooter(prefix(msg), msg, hadMod, inputOverride, servicesStatus), steps, logEntries };
  }

  let hadModifications = false;

  if (!llmModel) {
    const msg = "Не задана модель LLM. Укажите AGENT_LLM_MODEL (и при необходимости AGENT_LLM_API_KEY или AGENT_LLM_BASE_URL для Ollama).";
    appendLog(msg);
    return makeReturn(msg);
  }

  const pushStep = (step: AgentStep): void => {
    steps.push(step);
    if (stepsRef) stepsRef.current = [...steps];
    onStep?.(step);
  };

  function buildDevClarificationAsk(userPrompt: string): string {
    const p = userPrompt.toLowerCase();
    // Точечные вопросы для распространённых сценариев.
    if (/\b(удали|удалить|удаление)\b/.test(p) && /(карточк|товар|продукт|item)/.test(p)) {
      return (
        "Для удаления карточек товара в «разработке» уточните, пожалуйста:\n\n" +
        "1) Можно удалить любые 2 карточки товара (например, по первым `id` в БД)?\n" +
        "2) Удаляем просто карточки (запись товара), или нужно также удалять связанные изображения/сущности (если каскад не настроен — уточните)?"
      );
    }

    if (/(нескольк|несколько).*(файл|файла|документ)|multi.*file|multiple.*file/.test(p) && /telegram|тг/.test(p)) {
      return (
        "Уточните формат для Telegram:\n\n" +
        "1) Вы хотите, чтобы бот отправлял несколько файлов в одном запросе модели ИИ (одним сообщением)?\n" +
        "2) Или чтобы он обрабатывал файлы по очереди отдельными запросами и потом объединял ответ?"
      );
    }

    // Фолбэк: короткие релевантные уточнения без упоминания конкретных модулей.
    return (
      "Для корректного выполнения в «разработке» уточните, пожалуйста:\n\n" +
      "1) Какую конкретно сущность/объект нужно изменить (какие `id`/файлы/страницы)?\n" +
      "2) Как проверить результат (какой факт/страница/изменение ожидается)?"
    );
  }

  const maxTurnChars = historyTurnMaxChars ?? 6000;
  const truncateHistoryTurn = (s: string) =>
    s.length > maxTurnChars ? s.slice(0, maxTurnChars) + `\n[... обрезано, всего ${s.length} симв.]` : s;
  const historyMessages: ChatMessage[] = historyTurns.map((t) => {
    const raw = t.role === "assistant" ? stripPrefixChain(t.content) : t.content;
    const withoutFooter = t.role === "assistant" ? stripAgentReportFooter(raw) : raw;
    return { role: t.role, content: truncateHistoryTurn(withoutFooter) };
  });

  const messages: ChatMessage[] =
    mode === "chat"
      ? [
          ...historyMessages,
          { role: "user", content: prompt },
        ]
      : sendSystemPrompt
        ? [
            { role: "system", content: systemPrompt },
            ...historyMessages,
            { role: "user", content: prompt },
          ]
        : [
            ...historyMessages,
            { role: "user", content: prompt },
          ];

  const systemCharsInRequest = sendSystemPrompt ? systemPrompt.length : 0;
  const initInputChars =
    systemCharsInRequest +
    prompt.length +
    historyTurns.reduce((s, t) => s + t.content.length, 0);
  appendLog(`========== ПОЛНЫЙ ВВОД В МОДЕЛЬ ==========`);
  appendLog(`Размеры: промпт ${prompt.length} симв., системный в запросе ${systemCharsInRequest} симв., история ${historyTurns.length} реплик. Всего ~${initInputChars} симв.`);
  if (mode !== "chat") {
    if (sendSystemPrompt) {
      appendLog(`--- СИСТЕМНЫЙ ПРОМПТ (первые ${Math.min(5000, systemPrompt.length)} симв.) ---`);
      appendLog(systemPrompt.length > 5000 ? systemPrompt.slice(0, 5000) + `\n...[обрезано, всего ${systemPrompt.length} симв.]` : systemPrompt);
    } else {
      appendLog("--- СИСТЕМНЫЙ ПРОМПТ: не отправляется (повторное сообщение в чате, модель уже в контексте) ---");
    }
  } else {
    appendLog("--- РЕЖИМ КУРИЛКА: системный промпт НЕ используется ---");
  }
  appendLog(`--- ИСТОРИЯ (${historyTurns.length} реплик) ---`);
  for (let i = 0; i < historyTurns.length; i++) {
    const t = historyTurns[i]!;
    const chunk = t.content.length > MAX_DUMP_IN_LOG ? t.content.slice(0, MAX_DUMP_IN_LOG) + `...[обрезано]` : t.content;
    appendLog(`[${t.role}] (${t.content.length} симв.):\n${chunk}`);
  }
  appendLog(`--- ТЕКУЩИЙ ПРОМПТ (полностью) ---`);
  appendLog(prompt.length > MAX_DUMP_IN_LOG ? prompt.slice(0, MAX_DUMP_IN_LOG) + `\n...[обрезано, всего ${prompt.length} симв.]` : prompt);
  pushStep({
    type: "llm",
    text: "Запрос к модели",
    detail: `Ввод: ${initInputChars} симв., ${messages.length} сообщений в контексте`,
    requestSummary: `Промпт (${prompt.length} симв.): ${prompt.slice(0, 1200)}${prompt.length > 1200 ? "…" : ""}`,
  });

  const tools = mode === "chat" ? TOOLS_CHAT : mode === "consult" ? TOOLS_CONSULT : TOOLS_FOR_LLM;
  let iterations = 0;
  let lastThoughtSignature: string | undefined;

  const { modelId: apiModelId } = parseModelIdWithModality(llmModel ?? "");
  const requestImageOutput = shouldRequestImageOutput(llmModel ?? "");
  if (requestImageOutput) appendLog("Включён вывод изображений (responseModalities) по признаку модели");

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;
    const totalChars = messages.reduce((s, m) => s + (typeof m.content === "string" ? m.content.length : 0), 0);
    appendLog(`--- Итерация ${iterations} --- Контекст: ${messages.length} сообщений, ~${totalChars} символов`);
    pushStep({
      type: "llm",
      text: `Обращение к модели (итерация ${iterations})`,
      detail: `Контекст: ${messages.length} сообщ., ~${totalChars} симв.`,
      requestSummary: iterations === 1 ? `Промпт: ${prompt.slice(0, 1000)}${prompt.length > 1000 ? "…" : ""}` : `Итерация ${iterations}: в контексте учтены ответ модели и результаты инструментов`,
    });

    let response: Awaited<ReturnType<typeof request>>;
    try {
      // Роутинг по провайдеру:
      // - Google (Gemini/Gemma и др.): llmApiKey + llmBaseUrl (AGENT_LLM_API_KEY/AGENT_LLM_BASE_URL)
      // - OpenRouter (Claude и т.п.): ключ/URL из modelOverride (от админки) или openRouterApiKey/openRouterBaseUrl из .env.
      const modelForRouting = apiModelId || llmModel || "";
      const isOpenRouter = isOpenRouterModelId(modelForRouting);
      const openRouterKey = (openRouterApiKey?.trim() || llmApiKey?.trim()) || undefined;
      const openRouterUrl = openRouterBaseUrl?.trim() || llmBaseUrl?.trim() || "https://openrouter.ai/api/v1";
      let effectiveApiKey = isOpenRouter ? openRouterKey : llmApiKey;
      let effectiveBaseUrl = isOpenRouter ? openRouterUrl : llmBaseUrl;
      if (isOpenRouter && !effectiveApiKey) {
        appendLog("OpenRouter выбран, но API-ключ не задан (AGENT_OPENROUTER_API_KEY или apiKey в запросе).");
        pushStep({
          type: "llm",
          text: "Ошибка: нет API-ключа OpenRouter",
          detail: "Задайте AGENT_OPENROUTER_API_KEY в .env или выберите модель Google (Gemini).",
          requestSummary: "Нет cookie auth credentials = отсутствует Bearer-ключ для OpenRouter.",
        });
        return makeReturn(
          "Для модели OpenRouter нужен API-ключ. Задайте AGENT_OPENROUTER_API_KEY в .env на сервере или выберите модель Google (Gemini)."
        );
      }
      response = await request(messages, tools, {
        model: apiModelId || llmModel,
        apiKey: effectiveApiKey,
        baseUrl: effectiveBaseUrl,
        maxTokens: Math.min(maxOutputLength, 16384),
        requestTimeoutMs: Math.min(timeoutMs, 120_000),
        proxyUrl,
        proxyConnectTimeoutMs: proxyConnectTimeoutMs,
        thoughtSignature: lastThoughtSignature,
        thinkingLevel,
        responseModalitiesImage: requestImageOutput,
        inputImages: options?.inputImages,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errDetail = err instanceof Error && err.cause ? (err.cause instanceof Error ? err.cause.message : String(err.cause)) : "";
      appendLog(`Ошибка запроса к модели: ${errMsg}${errDetail ? `; причина: ${errDetail}` : ""}`);
      pushStep({
        type: "llm",
        text: "Ошибка запроса к модели",
        detail: errMsg + (errDetail ? ` (${errDetail})` : ""),
        requestSummary: `Ошибка: ${errMsg.slice(0, 500)}`,
      });
      return makeReturn(`Ошибка при обращении к модели: ${errMsg}${errDetail ? `. ${errDetail}` : ""}`);
    }

    if (response.thought_signature) {
      lastThoughtSignature = response.thought_signature;
    }

    if (response.tool_calls && response.tool_calls.length > 0) {
      const toolNames = response.tool_calls.map((tc) => tc.function.name).join(", ");
      const textLen = (response.content ?? "").length;
      appendLog(`Ответ модели: ${textLen} симв. текста + ${response.tool_calls.length} вызовов: [${toolNames}]`);
      if (response.content) {
        appendLog(`--- Текст ответа модели ---\n${response.content.length > MAX_DUMP_IN_LOG ? response.content.slice(0, MAX_DUMP_IN_LOG) + `...[обрезано]` : response.content}`);
      }

      // RADICAL GUARD: в режиме "разработка" запрещаем любые tool-вызовы, пока модель не задала
      // хотя бы один уточняющий вопрос пользователю. Это гарантирует, что агент не пойдёт "вслепую"
      // и не начнёт выполнять запреты вроде sed/run_command до уточнения требований.
      if (mode === "dev") {
        const responseText = String(response.content ?? "");
        const hasAnyClarifyingQuestionInHistory = historyTurns
          .slice()
          .reverse()
          .some((t) => {
            if (t.role !== "assistant") return false;
            const c = String(t.content ?? "");
            return c.includes("?") || /\b(уточн|какие|подтверд)\b/i.test(c);
          });
        const responseHasClarification =
          responseText.includes("?") || /\b(уточн|какие|подтверд)\b/i.test(responseText);
        // Уже был ответ ассистента в истории запроса (предыдущий HTTP-ход) — пользователь/раннер теста ответили.
        // Иначе guard снова блокирует tools, если формулировка уточнения не попала в эвристику выше (баг прогонов №26–27).
        const priorAssistantInHistory = historyTurns.some((t) => t.role === "assistant");
        if (!priorAssistantInHistory && !hasAnyClarifyingQuestionInHistory) {
          // Если в первом же ответе модель уже задала уточняющие вопросы, НЕ выполняем tool_calls:
          // возвращаем текст вопросов/плана и ждём ответа пользователя. Это устраняет ваш кейс,
          // где модель спрашивает про «первую карточку», но одновременно вызывает read_file,
          // а guard затем ломает поток.
          const outText = responseHasClarification ? responseText.trim() : buildDevClarificationAsk(prompt);
          appendLog("DEV guard: returning clarifications and skipping tool calls");
          pushStep({
            type: "done",
            text: "Нужно уточнение",
            detail: "Tool-вызовы пропущены до ответа пользователя",
            requestSummary: "Модель задала уточняющие вопросы.",
          });
          return makeReturn(outText);
        }
      }

      for (const tc of response.tool_calls) {
        appendLog(`--- tool_call: ${tc.function.name} ---\nАргументы: ${tc.function.arguments}`);
      }
      messages.push({
        role: "assistant",
        content: response.content ?? "",
        tool_calls: response.tool_calls,
      });

      let disallowedCommandResult: string | null = null;
      for (const tc of response.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          args = {};
        }
        const name = tc.function.name;
        const argsStr = JSON.stringify(args);
        const argSummary = name === "read_file" || name === "write_file" ? String(args.path ?? "") : name === "grep" ? String(args.search_string ?? "") : name === "run_command" ? String(args.command ?? "").slice(0, 120) : "";
        appendLog(`Вызов: ${name} | Аргументы: ${argsStr}`);

        if (mode === "chat" && name !== "get_agent_info" && name !== "write_docs_file") {
          const result = `[error] В режиме «курилка» доступны только get_agent_info и write_docs_file (создание файлов в docs/). Обращение к коду и системе запрещено.`;
          pushStep({ type: "tool", text: name, detail: "заблокировано (режим курилка)", toolName: name, toolArgs: argsStr, toolResultSummary: "blocked", success: false });
          messages.push({ role: "tool", content: result, tool_call_id: tc.id, name });
          continue;
        }

        let result: string;
        try {
          result = await executeTool(name, args);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          appendLog(`Ошибка вызова ${name}: ${errMsg}`);
          pushStep({
            type: "tool",
            text: `${name}${argSummary ? `: ${argSummary}` : ""}`,
            detail: "исключение при выполнении",
            toolName: name,
            toolArgs: argsStr,
            toolResultSummary: errMsg.slice(0, 500),
            success: false,
          });
          messages.push({
            role: "tool",
            content: `[error] ${errMsg}`,
            tool_call_id: tc.id,
            name,
          });
          continue;
        }
        if (name === "run_command" && result.startsWith(RUN_COMMAND_DISALLOWED_PREFIX)) {
          disallowedCommandResult = result;
          const resultSummary = "команда не в белом списке — запрос остановлен";
          pushStep({
            type: "tool",
            text: `${name}: ${String(args.command ?? "").slice(0, 100)}`,
            detail: "неразрешённая команда",
            toolName: name,
            toolArgs: argsStr,
            toolResultSummary: resultSummary,
            success: false,
          });
          appendLog(`Результат ${name}: ${resultSummary}`);
          break;
        }
        // ВАЖНО: не считаем содержимое read_file/grep "ошибкой" только потому что в коде встречается слово "Error".
        // Ошибка инструмента помечается строго префиксом вида "[tool] error:" или "[error] ...".
        const isError =
          /^\[(read_file|write_file|list_dir|grep)\]\s+error:/i.test(result) ||
          /^\[error\]/i.test(result) ||
          result.startsWith(RUN_COMMAND_DISALLOWED_PREFIX);
        if (!isError && (name === "write_file" || name === "run_command")) hadModifications = true;
        const maxInContext = toolResultMaxCharsInContext ?? 8000;
        const resultForContext = result.length > maxInContext
          ? result.slice(0, maxInContext) + `\n\n[... обрезано для экономии токенов, всего ${result.length} символов. Запроси read_file для полного содержимого.]`
          : result;
        const resultPreview = result.length > MAX_TOOL_RESULT_IN_LOG ? result.slice(0, MAX_TOOL_RESULT_IN_LOG) + "…[обрезано]" : result;
        const resultSummary = isError
          ? result.replace(/\n/g, " ").slice(0, 600)
          : result.length > 500 ? `OK, ${result.length} симв. Начало: ${result.slice(0, 400).replace(/\n/g, " ")}…` : result.slice(0, 500);
        appendLog(`Результат ${name} (${result.length} симв.): ${resultPreview}`);

        pushStep({
          type: "tool",
          text: `${name}${argSummary ? `: ${argSummary}` : ""}`,
          detail: argSummary || `аргументы: ${argsStr.slice(0, 100)}`,
          toolName: name,
          toolArgs: argsStr,
          toolResultSummary: resultSummary,
          success: !isError,
        });
        messages.push({
          role: "tool",
          content: resultForContext,
          tool_call_id: tc.id,
          name,
        });
      }
      if (disallowedCommandResult !== null) {
        appendLog("Остановка: неразрешённая команда run_command");
        const out = disallowedCommandResult.length > maxOutputLength ? disallowedCommandResult.slice(0, maxOutputLength) + "…" : disallowedCommandResult;
        return makeReturn(out, hadModifications, messages);
      }
      continue;
    }

    let text = response.content?.trim() ?? "";
    if (text) {
      const isImageResponse = /!\[[^\]]*\]\(data:image\//.test(text);
      appendLog(`========== ФИНАЛЬНЫЙ ОТВЕТ МОДЕЛИ ==========`);
      appendLog(isImageResponse ? `Изображение (${text.length} симв. base64)` : `Размер: ${text.length} симв., ~${countWordsForFooter(text)} слов`);
      if (!isImageResponse) {
        appendLog(`--- Полный текст ответа ---`);
        appendLog(text.length > MAX_DUMP_IN_LOG ? text.slice(0, MAX_DUMP_IN_LOG) + `\n...[обрезано, всего ${text.length} симв.]` : text);
      }
      pushStep({
        type: "done",
        text: "Ответ получен",
        requestSummary: isImageResponse
          ? "Финальный ответ: изображение"
          : `Финальный ответ (${text.length} симв.): ${text.slice(0, 1500)}${text.length > 1500 ? "…" : ""}`,
      });
      // Сохраняем base64-картинки в файлы — иначе обрезка и длинные data-URL ломают отображение
      text = replaceDataUrlsWithFiles(text, root);
      const cleaned = stripPrefixChain(text);
      const out = cleaned.length > maxOutputLength ? cleaned.slice(0, maxOutputLength) + "…" : cleaned;
      return makeReturn(out, hadModifications, messages);
    }
  }

  appendLog("Достигнут лимит шагов");
  const msg = "Достигнут лимит шагов. Попробуйте упростить запрос.";
  return makeReturn(msg);
}

/**
 * Записывает лог рассуждений в файл .agent-logs/<logId>.log (не более MAX_REASONING_LOG_LENGTH символов).
 */
export function writeAgentLogToFile(root: string, logId: string, logEntries: string[]): void {
  const dir = join(root, AGENT_LOGS_DIR);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${logId}.log`);
  let content = logEntries.join("\n");
  if (content.length > MAX_REASONING_LOG_LENGTH) {
    content = `[лог обрезан, показаны последние ${MAX_REASONING_LOG_LENGTH} символов]\n${content.slice(-MAX_REASONING_LOG_LENGTH)}`;
  }
  writeFileSync(path, content, "utf-8");
  writeFileSync(join(dir, LAST_REASONING_FILE), content, "utf-8");
}

/** Сохраняет полный ввод и вывод в .agent-logs (режим разработка) для просмотра человеком. */
function writeLastInputOutput(
  root: string,
  inputSerialized: string,
  outputRaw: string
): void {
  try {
    const dir = join(root, AGENT_LOGS_DIR);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, LAST_INPUT_FILE), inputSerialized, "utf-8");
    writeFileSync(join(dir, LAST_OUTPUT_FILE), outputRaw, "utf-8");
  } catch {
    // ignore
  }
}

function serializeMessagesForInput(msgs: Array<{ role: string; content: string | unknown; tool_calls?: unknown; tool_call_id?: string; name?: string }>): string {
  const lines: string[] = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]!;
    const role = m.role;
    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    if (m.tool_calls) {
      lines.push(`\n--- Message ${i + 1} [${role}] + tool_calls ---`);
      lines.push(content);
      lines.push("tool_calls: " + JSON.stringify(m.tool_calls, null, 2));
    } else {
      lines.push(`\n--- Message ${i + 1} [${role}] ---`);
      lines.push(content);
    }
  }
  return lines.join("\n").trimStart();
}
