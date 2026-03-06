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
  try {
    const raw = (await request.json()) as { model?: unknown; prompt_scope?: unknown } | undefined;
    if (raw && typeof raw.model === "string" && raw.model.trim()) {
      clientModel = raw.model.trim();
    }
    if (raw && raw.prompt_scope !== undefined) {
      const s = String(raw.prompt_scope).toLowerCase();
      if (s === "brief" || s === "кратко") promptScope = "brief";
      else if (s === "full" || s === "полная детализация" || s === "полная") promptScope = "full";
      else promptScope = "standard";
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
  const jsonMatch = /```json\s*([\s\S]*?)```/i.exec(raw) ?? /(\{[\s\S]*\})/.exec(raw);
  let parsed: GenerateResponse | null = null;
  let prefix = "";
  let suffix = "";
  if (jsonMatch) {
    const fullMatch = jsonMatch[0];
    const matchStart = raw.indexOf(fullMatch);
    if (matchStart >= 0) {
      prefix = raw.slice(0, matchStart).trim();
      suffix = raw.slice(matchStart + fullMatch.length).trim();
    }
    try {
      parsed = JSON.parse(jsonMatch[1]!) as GenerateResponse;
    } catch {
      parsed = null;
    }
  } else {
    // Нет JSON — пробуем вырезать подвал агента (--- Модель: ... Службы: ...)
    const footerStart = raw.indexOf("\n\n---\nМодель:");
    if (footerStart >= 0) {
      suffix = raw.slice(footerStart).trim();
      const middle = raw.slice(0, footerStart).trim();
      // Преамбула — всё до первого значимого контента (например до ``` или до первой строки задачи)
      const codeBlockStart = middle.search(/\n\s*```/);
      if (codeBlockStart > 0) prefix = middle.slice(0, codeBlockStart).trim();
      else if (middle.length > 0) prefix = middle.slice(0, Math.min(200, middle.length)).trim();
    }
  }

  // В поле описания — только суть задачи: из JSON prompt_markdown или очищенный raw без преамбулы/подвала
  let promptMarkdown: string;
  if (parsed && typeof parsed.prompt_markdown === "string" && parsed.prompt_markdown.trim().length > 0) {
    promptMarkdown = parsed.prompt_markdown.trim();
  } else if (raw.length > 0 && jsonMatch) {
    const fullMatch = jsonMatch[0];
    const matchStart = raw.indexOf(fullMatch);
    const afterJson = matchStart >= 0 ? raw.slice(matchStart + fullMatch.length).trim() : raw;
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
  // «Об этом промпте» = преамбула и подвал из ответа агента (не передаются в Cursor/модель)
  const promptAboutParts: string[] = [];
  if (prefix.length > 0) promptAboutParts.push(prefix);
  if (suffix.length > 0) promptAboutParts.push(suffix);
  const prompt_about =
    promptAboutParts.length > 0
      ? promptAboutParts.join("\n\n")
      : [
          `Модель: ${selectedModel ?? "не указана"}`,
          `Дата создания промпта: ${now.toISOString().slice(0, 19).replace("T", " ")}`,
          `Объём: ${promptScope === "brief" ? "Кратко" : promptScope === "full" ? "Полная детализация" : "Стандарт"}`,
        ].join("\n");

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

