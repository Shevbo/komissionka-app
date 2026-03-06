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
  try {
    const raw = (await request.json()) as { model?: unknown } | undefined;
    if (raw && typeof raw.model === "string" && raw.model.trim()) {
      clientModel = raw.model.trim();
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

  const classificationHint =
    row.task_type || row.modules || row.components || row.complexity
      ? `Текущие предполагаемые классификаторы (их можно скорректировать, если они неточны):
- task_type (тип задачи): ${row.task_type ?? "-"}
- modules (модули): ${row.modules ?? "-"}
- components (компоненты): ${row.components ?? "-"}
- complexity (сложность 1-5): ${row.complexity ?? "-"}`
      : "Классификаторы пока не заданы — определи их сам.";

  const metaPrompt = [
    "Ты — ведущий разработчик и архитектор проекта «Комиссионка» (Next.js, TypeScript, Prisma 7, PostgreSQL, NextAuth, Telegram-бот, отдельный агент к модели ИИ).",
    "",
    "ЕДИНСТВЕННЫЙ ИСТОЧНИК ЗАДАЧИ — краткое описание ниже. Игнорируй любой другой контекст, память или предыдущие сообщения.",
    "",
    "КРАТКОЕ ОПИСАНИЕ ЗАДАЧИ (short_description):",
    `«${short}»`,
    "",
    `id записи (только для лога): ${row.id}`,
    "Текущее описание/промпт для ИИ (может быть пустым, можно использовать как черновик):",
    existing ? existing : "(пока пусто).",
    "",
    "КРИТИЧНО — совпадение смыслов:",
    "prompt_markdown должен раскрывать ТОЛЬКО и СТРОГО задачу из краткого описания выше. Запрещено подставлять другую задачу, брать формулировки из другого контекста или добавлять требования, которых нет в кратком описании. Смысл промпта и смысл краткого описания должны совпадать на 100%.",
    "",
    "Твоя задача:",
    "1) Сформировать полный, строгий, технический промпт для реализации ИМЕННО этой задачи (из краткого описания) профессиональным разработчиком соответствующего стека.",
    "2) Присвоить задаче классификаторы:",
    "   - task_type: один из значений [\"bug\", \"feature\", \"data_change\"].",
    "   - modules: массив из подмножества [\"app\", \"agent\", \"tgbot\"].",
    "   - components: массив строк (например, \"backend\", \"frontend\", \"prisma\", \"api\", \"docs\", \"deploy\" и т.п.).",
    "   - complexity: целое число от 1 до 5 (1 — очень легко, 5 — очень сложно).",
    "",
    classificationHint,
    "",
    "Требования к промпту:",
    "- раскрывать только задачу из краткого описания; без лишней воды;",
    "- промпт строго технический, ориентирован на реализацию (какие файлы менять, какие сущности/эндпоинты трогать, как тестировать);",
    "- используй Markdown с заголовками и списками;",
    "- добавь упоминание, какие части задачи можно выполнять поэтапно.",
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
  if (jsonMatch) {
    try {
      parsed = JSON.parse(jsonMatch[1]!) as GenerateResponse;
    } catch {
      // Игнорируем ошибку парсинга и используем fallback ниже.
      parsed = null;
    }
  }
  const promptMarkdown =
    parsed && typeof parsed.prompt_markdown === "string" && parsed.prompt_markdown.trim().length > 0
      ? parsed.prompt_markdown
      : raw.length > 0
      ? raw
      : row.description_prompt;
  const modulesArr = parsed && Array.isArray(parsed.modules) ? parsed.modules : null;
  const componentsArr = parsed && Array.isArray(parsed.components) ? parsed.components : null;

  const modules = modulesArr ? modulesArr.join(", ") : null;
  const components = componentsArr ? componentsArr.join(", ") : null;

  const now = new Date();
  const prefaceLines = [
    `> Модель: ${selectedModel ?? "не указана"}`,
    `> Дата создания промпта: ${now.toISOString().slice(0, 19).replace("T", " ")}`,
    "",
  ];
  const finalPrompt = `${prefaceLines.join("\n")}${promptMarkdown}`;

  const updated = await prisma.backlog.update({
    where: { id: row.id },
    data: {
      description_prompt: finalPrompt,
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

  return NextResponse.json({
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
      doc_link: updated.doc_link,
      test_order_or_link: updated.test_order_or_link,
      created_at: updated.created_at?.toISOString() ?? null,
      status_changed_at: updated.status_changed_at?.toISOString() ?? null,
    },
  });
}

