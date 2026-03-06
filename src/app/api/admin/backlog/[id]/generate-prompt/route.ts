import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { syncBacklogToDoc, type BacklogRow } from "komiss/lib/backlog-sync";

async function isAdminRequest(request: Request): Promise<boolean> {
  const agentKey = request.headers.get("x-agent-api-key");
  if (agentKey && process.env.AGENT_API_KEY && agentKey === process.env.AGENT_API_KEY) {
    return true;
  }
  const session = await getServerSession(authOptions);
  const profile = session?.user?.id
    ? await prisma.profiles.findUnique({ where: { id: session.user.id }, select: { role: true } })
    : null;
  return profile?.role === "admin";
}

async function syncBacklogToDocs(): Promise<void> {
  const rows = await prisma.backlog.findMany({
    orderBy: [{ order_num: "asc" }, { created_at: "desc" }],
  });
  const list: BacklogRow[] = rows.map((r) => ({
    id: r.id,
    order_num: r.order_num,
    sprint_number: r.sprint_number,
    sprint_status: r.sprint_status,
    short_description: r.short_description,
    description_prompt: r.description_prompt,
    task_status: r.task_status,
    task_type: r.task_type,
    modules: r.modules,
    components: r.components,
    complexity: r.complexity,
    prompt_model: r.prompt_model,
    prompt_created_at: r.prompt_created_at?.toISOString() ?? null,
    prompt_duration_sec: r.prompt_duration_sec ?? null,
    prompt_log_id: r.prompt_log_id,
    doc_link: r.doc_link,
    test_order_or_link: r.test_order_or_link,
    created_at: r.created_at?.toISOString() ?? null,
    status_changed_at: r.status_changed_at?.toISOString() ?? null,
  }));
  syncBacklogToDoc(list, process.cwd());
}

type GenerateResponse = {
  prompt_markdown: string;
  task_type?: string | null;
  modules?: string[] | null;
  components?: string[] | null;
  complexity?: number | null;
};

/**
 * Извлекает блок ```json ... ``` из текста, учитывая что внутри JSON-строк
 * могут быть тройные обратные кавычки (например код в prompt_markdown).
 * Ищет закрывающие ``` только вне строки в кавычках.
 */
function extractJsonBlockFromMarkdown(raw: string): { content: string; fullMatch: string; start: number; end: number } | null {
  const openTag = "```json";
  const openTagAlt = "```";
  const idx = raw.indexOf(openTag);
  const startBlock = idx >= 0 ? idx : raw.indexOf(openTagAlt);
  if (startBlock < 0) return null;
  const contentStart = idx >= 0 ? startBlock + openTag.length : startBlock + openTagAlt.length;
  const afterOpen = raw.slice(contentStart).replace(/^\s*\n?/, "");
  const contentStartAdjusted = contentStart + (raw.slice(contentStart).length - afterOpen.length);
  let inString = false;
  let escape = false;
  let i = contentStartAdjusted;
  while (i < raw.length - 2) {
    const c = raw[i];
    if (escape) {
      escape = false;
      i++;
      continue;
    }
    if (inString) {
      if (c === "\\") {
        escape = true;
        i++;
        continue;
      }
      if (c === '"') {
        inString = false;
        i++;
        continue;
      }
      i++;
      continue;
    }
    if (c === '"') {
      inString = true;
      i++;
      continue;
    }
    if (c === "`" && raw[i + 1] === "`" && raw[i + 2] === "`") {
      const content = raw.slice(contentStartAdjusted, i).trim();
      const fullMatch = raw.slice(startBlock, i + 3);
      return { content, fullMatch, start: startBlock, end: i + 3 };
    }
    i++;
  }
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAdmin = await isAdminRequest(request);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  let clientModel: string | null = null;
  let promptScope: "brief" | "standard" | "full" = "standard";
  let descriptionBeforeGeneration: string | null = null;
  try {
    const raw = (await request.json()) as {
      model?: unknown;
      prompt_scope?: unknown;
      description_before_generation?: unknown;
    } | undefined;
    if (raw && typeof raw.model === "string" && raw.model.trim()) {
      clientModel = raw.model.trim();
    }
    if (raw && raw.prompt_scope !== undefined) {
      const s = String(raw.prompt_scope).toLowerCase();
      if (s === "brief" || s === "кратко") promptScope = "brief";
      else if (s === "full" || s === "полная детализация" || s === "полная") promptScope = "full";
      else promptScope = "standard";
    }
    if (raw && typeof raw.description_before_generation === "string") {
      descriptionBeforeGeneration = raw.description_before_generation;
    }
  } catch {
    // нет тела или некорректный JSON — игнорируем, используем значения по умолчанию
  }
  const row = await prisma.backlog.findUnique({ where: { id } });
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const startedAt = Date.now();
  const appUrl =
    process.env.APP_BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:3000";

  const settings = await prisma.site_settings.findUnique({ where: { id: "main" } });
  const selectedModel =
    clientModel?.trim() ||
    settings?.agent_llm_model?.trim() ||
    process.env.AGENT_LLM_MODEL ||
    null;

  const short = row.short_description;
  const existing = row.description_prompt;

  const requestNonce = `${id}-${Date.now()}`;

  const classificationHint =
    row.task_type || row.modules || row.components || row.complexity
      ? `Текущие предполагаемые классификаторы (их можно скорректировать, если они неточны):
- task_type (тип задачи): ${row.task_type ?? "-"}
- modules (модули): ${row.modules ?? "-"}
- components (компоненты): ${row.components ?? "-"}
- complexity (сложность 1-5): ${row.complexity ?? "-"}`
      : "Классификаторы пока не заданы — определи их сам.";

  const scopeInstruction =
    promptScope === "brief"
      ? "Объём промпта: КРАТКО — только суть задачи, минимум текста, без подразделов."
      : promptScope === "full"
        ? "Объём промпта: ПОЛНАЯ ДЕТАЛИЗАЦИЯ — максимально развёрнутый технический промпт с подразделами, примерами кода, списками файлов."
        : "Объём промпта: СТАНДАРТ — развёрнутый технический промпт с заголовками и списками, без избыточной детализации.";

  const metaPrompt = [
    `[Запрос ${requestNonce}. Генерация промпта только для этого тикета.]`,
    "",
    "Ты — ведущий разработчик и архитектор проекта «Комиссионка» (Next.js, TypeScript, Prisma 7, PostgreSQL, NextAuth, Telegram-бот, отдельный агент к модели ИИ).",
    "",
    "КРАТКОЕ ОПИСАНИЕ ЗАДАЧИ (short_description):",
    `«${short}»`,
    "",
    `id записи (только для лога): ${row.id}`,
    "Текущее описание/промпт для ИИ (может быть пустым, черновик):",
    existing ? existing : "(пока пусто).",
    "",
    scopeInstruction,
    "",
    "Твоя задача:",
    "1) Сформировать технический промпт для реализации этой задачи (только описание задачи, без инструкций по тестированию — тестирование указывается в отдельном поле тикета «Тестирование / ссылка на сценарии»).",
    "2) Присвоить задаче классификаторы:",
    "   - task_type: один из значений [\"bug\", \"feature\", \"data_change\"].",
    "   - modules: массив из подмножества [\"app\", \"agent\", \"tgbot\"].",
    "   - components: массив строк (например, \"backend\", \"frontend\", \"prisma\", \"api\", \"docs\", \"deploy\" и т.п.).",
    "   - complexity: целое число от 1 до 5 (1 — очень легко, 5 — очень сложно).",
    "",
    classificationHint,
    "",
    "Требования к prompt_markdown:",
    "- только про саму задачу (что сделать, какие файлы/эндпоинты, как реализовать); без разделов «как тестировать»;",
    "- структурированный и понятный человеку; отражает суть задачи с минимально необходимой детализацией;",
    "- Markdown с заголовками и списками; можно указать, какие части выполнять поэтапно.",
    "",
    "Формат ОТВЕТА (ОБЯЗАТЕЛЬНО, БЕЗ ДОПОЛНИТЕЛЬНОГО ТЕКСТА ВНЕ JSON):",
    "```json",
    "{",
    '  "task_type": "feature" | "bug" | "data_change",',
    '  "modules": ["app", "agent"],',
    '  "components": ["frontend", "api"],',
    '  "complexity": 1 | 2 | 3 | 4 | 5,',
    '  "prompt_markdown": "Здесь полный Markdown-промпт для разработчика по описанной задаче."',
    "}",
    "```",
    "",
    "Где:",
    "- prompt_markdown — это тот текст, который будет сохранён в backlog.description_prompt и показан разработчику как постановка задачи;",
    "- JSON должен быть корректным и парситься стандартным JSON-парсером (кавычки только двойные, без комментариев).",
  ].join("\n");

  const agentBody = {
    prompt: metaPrompt,
    history: [] as Array<{ role: string; content: string }>,
    mode: "dev",
    project: "Комиссионка backlog",
    chatName: `backlog:${row.id}:${Date.now()}`,
    environment: "admin",
    disableCache: true,
    ...(clientModel && clientModel.trim() ? { model: clientModel.trim() } : {}),
  };

  const res = await fetch(`${appUrl}/api/admin/agent/run`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
      Cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify(agentBody),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: data.error ?? `Agent error: HTTP ${res.status}` },
      { status: 502 }
    );
  }
  const data = (await res.json()) as {
    result?: string;
    steps?: unknown;
    logId?: string | null;
  };

  const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

  const raw = (data.result ?? "").trim();
  const extracted = extractJsonBlockFromMarkdown(raw);
  let parsed: GenerateResponse | null = null;
  let prefix = "";
  let suffix = "";
  let jsonBlockFound = false;

  if (extracted) {
    jsonBlockFound = true;
    prefix = raw.slice(0, extracted.start).trim();
    suffix = raw.slice(extracted.end).trim();
    try {
      parsed = JSON.parse(extracted.content) as GenerateResponse;
    } catch {
      parsed = null;
    }
  }
  if (!extracted) {
    const fallback = /(\{[\s\S]*\})/.exec(raw);
    if (fallback) {
      try {
        parsed = JSON.parse(fallback[1]!) as GenerateResponse;
        jsonBlockFound = true;
        const matchStart = fallback.index;
        prefix = raw.slice(0, matchStart).trim();
        suffix = raw.slice(matchStart + fallback[0].length).trim();
      } catch {
        parsed = null;
      }
    }
  }
  if (!jsonBlockFound) {
    const footerStart = raw.indexOf("\n\n---\nМодель:");
    if (footerStart >= 0) {
      suffix = raw.slice(footerStart).trim();
      const middle = raw.slice(0, footerStart).trim();
      const codeBlockStart = middle.search(/\n\s*```/);
      if (codeBlockStart > 0) prefix = middle.slice(0, codeBlockStart).trim();
      else if (middle.length > 0) prefix = middle.slice(0, Math.min(200, middle.length)).trim();
    }
  }

  // В поле описания — только суть задачи: из JSON prompt_markdown или очищенный raw без преамбулы/подвала
  let promptMarkdown: string;
  if (parsed && typeof parsed.prompt_markdown === "string" && parsed.prompt_markdown.trim().length > 0) {
    promptMarkdown = parsed.prompt_markdown.trim();
  } else if (raw.length > 0 && jsonBlockFound) {
    const afterJson = suffix;
    const withoutFooter = afterJson.includes("\n\n---\nМодель:") ? afterJson.slice(0, afterJson.indexOf("\n\n---\nМодель:")).trim() : afterJson;
    promptMarkdown = withoutFooter.length > 0 ? withoutFooter : row.description_prompt ?? "";
  } else if (raw.length > 0) {
    const withoutFooter = raw.includes("\n\n---\nМодель:") ? raw.slice(0, raw.indexOf("\n\n---\nМодель:")).trim() : raw;
    const withoutPrefix = prefix.length > 0 && withoutFooter.startsWith(prefix) ? withoutFooter.slice(prefix.length).trim() : withoutFooter;
    promptMarkdown = withoutPrefix.length > 0 ? withoutPrefix : row.description_prompt ?? "";
  } else {
    promptMarkdown = row.description_prompt ?? "";
  }

  const modulesArr = parsed && Array.isArray(parsed.modules) ? parsed.modules : null;
  const componentsArr = parsed && Array.isArray(parsed.components) ? parsed.components : null;

  const modules = modulesArr ? modulesArr.join(", ") : null;
  const components = componentsArr ? componentsArr.join(", ") : null;

  const now = new Date();
  // «Об этом промпте»: исходная формулировка (краткое + описание до генерации), символы/слова обмена, версии (не передаётся в Cursor/модель)
  const promptAboutLines: string[] = [];
  const shortForAbout = (row.short_description ?? "").trim() || "—";
  const desc =
    (descriptionBeforeGeneration !== null
      ? descriptionBeforeGeneration
      : (row.description_prompt ?? "").trim()
    ).trim();
  const originalPhrase = desc ? `${shortForAbout}. ${desc}` : shortForAbout;
  promptAboutLines.push(`Исходно задача звучала так: ${originalPhrase}`);
  const symMatch = /Символов:\s*ввод\s*(\d+)\s*\/\s*вывод\s*(\d+)\s*\(слов:\s*(\d+)\s*\/\s*(\d+)\)/.exec(suffix);
  if (symMatch) {
    promptAboutLines.push(
      `Символов было в обмене с моделью ИИ: ввод ${symMatch[1]} / вывод ${symMatch[2]} (слов: ${symMatch[3]} / ${symMatch[4]})`
    );
  }
  const verAfterMatch = /после:\s*(app v[\d.]+,?\s*agent v[\d.]+,?\s*tgbot v[\d.]+)/i.exec(suffix);
  const verSimpleMatch = /Версии:\s*(app v[\d.]+,?\s*agent v[\d.]+,?\s*tgbot v[\d.]+)/i.exec(suffix);
  const verLine = verAfterMatch?.[1] ?? verSimpleMatch?.[1];
  if (verLine) {
    promptAboutLines.push(`Версии на момент генерации: ${verLine.trim()}`);
  } else {
    try {
      const { readFileSync, existsSync } = await import("node:fs");
      const { join } = await import("node:path");
      const vPath = join(process.cwd(), "version.json");
      if (existsSync(vPath)) {
        const v = JSON.parse(readFileSync(vPath, "utf-8")) as { app?: string; agent?: string; tgbot?: string };
        promptAboutLines.push(
          `Версии на момент генерации: app v${v.app ?? "?"}, agent v${v.agent ?? "?"}, tgbot v${v.tgbot ?? "?"}`
        );
      }
    } catch {
      // ignore
    }
  }
  const prompt_about = promptAboutLines.join("\n\n");

  const updated = await prisma.backlog.update({
    where: { id: row.id },
    data: {
      description_prompt: promptMarkdown,
      prompt_about,
      task_type: parsed?.task_type ?? row.task_type,
      modules: modules ?? row.modules,
      components: components ?? row.components,
      complexity: parsed?.complexity ?? row.complexity,
      prompt_model: selectedModel,
      prompt_created_at: now,
      prompt_duration_sec: durationSec,
      prompt_log_id: data.logId ?? row.prompt_log_id,
    },
  });

  await syncBacklogToDocs();

  return NextResponse.json(
    {
      ok: true,
      row: {
        id: updated.id,
        order_num: updated.order_num,
        sprint_number: updated.sprint_number,
        sprint_status: updated.sprint_status,
        short_description: updated.short_description,
        description_prompt: updated.description_prompt,
        task_status: updated.task_status,
        task_type: updated.task_type,
        modules: updated.modules,
        components: updated.components,
        complexity: updated.complexity,
        prompt_model: updated.prompt_model,
        prompt_created_at: updated.prompt_created_at?.toISOString() ?? null,
        prompt_duration_sec: updated.prompt_duration_sec ?? null,
        prompt_log_id: updated.prompt_log_id,
        prompt_about: updated.prompt_about,
        doc_link: updated.doc_link,
        test_order_or_link: updated.test_order_or_link,
        created_at: updated.created_at?.toISOString() ?? null,
        status_changed_at: updated.status_changed_at?.toISOString() ?? null,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

