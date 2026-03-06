import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { syncBacklogToDoc, type BacklogRow } from "komiss/lib/backlog-sync";
import type { Prisma } from "@prisma/client";

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

const SPRINT_STATUSES = ["формируется", "выполняется", "реализован", "архив"] as const;
const TASK_STATUSES = ["не начато", "выполняется", "тестируется", "сделано", "отказ"] as const;
const SORT_FIELDS = ["order_num", "short_description", "created_at", "task_status", "id"] as const;

function mapRow(r: { id: string; order_num: number | null; sprint_number: number; sprint_status: string; short_description: string; description_prompt: string; task_status: string; task_type: string | null; modules: string | null; components: string | null; complexity: number | null; prompt_model: string | null; prompt_created_at: Date | null; prompt_duration_sec: number | null; prompt_log_id: string | null; prompt_about: string | null; doc_link: string | null; test_order_or_link: string | null; created_at: Date; status_changed_at: Date }) {
  return {
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
    prompt_about: r.prompt_about ?? null,
    doc_link: r.doc_link,
    test_order_or_link: r.test_order_or_link,
    created_at: r.created_at.toISOString(),
    status_changed_at: r.status_changed_at.toISOString(),
  };
}

export async function GET(request: Request) {
  const admin = await isAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("_page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("_limit") ?? "100", 10) || 100));
  const sort = (searchParams.get("_sort") ?? "order_num") as (typeof SORT_FIELDS)[number];
  const order = searchParams.get("_order") === "desc" ? "desc" : "asc";
  const filterTaskStatus = searchParams.get("task_status")?.trim() || null;
  const filterTaskType = searchParams.get("task_type")?.trim() || null;

  const orderBy: Prisma.backlogOrderByWithRelationInput[] =
    sort === "order_num"
      ? [{ order_num: { sort: order, nulls: "last" } }, { created_at: "desc" }]
      : sort === "short_description"
        ? [{ short_description: order }]
        : sort === "created_at"
          ? [{ created_at: order }]
          : sort === "task_status"
            ? [{ task_status: order }]
            : [{ id: order }];

  const where: Prisma.backlogWhereInput = {};
  if (filterTaskStatus) where.task_status = filterTaskStatus;
  if (filterTaskType) where.task_type = filterTaskType;

  const [rows, total] = await Promise.all([
    prisma.backlog.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.backlog.count({ where }),
  ]);

  return NextResponse.json({
    data: rows.map(mapRow),
    total,
    page,
    limit,
  });
}

function parseBody(body: unknown): {
  order_num?: number | null;
  sprint_number: number;
  sprint_status: string;
  short_description: string;
  description_prompt: string;
  task_status: string;
  task_type?: string | null;
  modules?: string | null;
  components?: string | null;
  complexity?: number | null;
  doc_link?: string | null;
  test_order_or_link?: string | null;
  prompt_about?: string | null;
} {
  const b = body as Record<string, unknown>;
  const sprint_number = typeof b?.sprint_number === "number" ? b.sprint_number : Number(b?.sprint_number);
  if (Number.isNaN(sprint_number) || sprint_number < 0) {
    throw new Error("sprint_number required (number >= 0)");
  }
  const sprint_status = typeof b?.sprint_status === "string" ? b.sprint_status.trim() : "";
  if (!SPRINT_STATUSES.includes(sprint_status as (typeof SPRINT_STATUSES)[number])) {
    throw new Error("sprint_status must be one of: " + SPRINT_STATUSES.join(", "));
  }
  const short_description = typeof b?.short_description === "string" ? b.short_description.trim() : "";
  if (!short_description) {
    throw new Error("short_description required");
  }
  const description_prompt = typeof b?.description_prompt === "string" ? b.description_prompt : "";
  const task_status = typeof b?.task_status === "string" ? b.task_status.trim() : "не начато";
  if (!TASK_STATUSES.includes(task_status as (typeof TASK_STATUSES)[number])) {
    throw new Error("task_status must be one of: " + TASK_STATUSES.join(", "));
  }
  const order_num = b?.order_num != null ? (typeof b.order_num === "number" ? b.order_num : Number(b.order_num)) : null;
  const doc_link = typeof b?.doc_link === "string" ? b.doc_link.trim() || null : null;
  const test_order_or_link = typeof b?.test_order_or_link === "string" ? b.test_order_or_link.trim() || null : null;
  const prompt_about = typeof b?.prompt_about === "string" ? b.prompt_about.trim() || null : null;
  return {
    order_num: Number.isNaN(order_num) ? null : order_num,
    sprint_number,
    sprint_status,
    short_description,
    description_prompt,
    task_status,
    task_type: typeof b?.task_type === "string" ? b.task_type.trim() || null : null,
    modules: typeof b?.modules === "string" ? b.modules.trim() || null : null,
    components: typeof b?.components === "string" ? b.components.trim() || null : null,
    complexity:
      typeof b?.complexity === "number"
        ? b.complexity
        : b?.complexity != null
        ? Number(b.complexity)
        : null,
    doc_link,
    test_order_or_link,
    prompt_about,
  };
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
    prompt_about: r.prompt_about ?? null,
    doc_link: r.doc_link,
    test_order_or_link: r.test_order_or_link,
    created_at: r.created_at?.toISOString() ?? null,
    status_changed_at: r.status_changed_at?.toISOString() ?? null,
  }));
  syncBacklogToDoc(list, process.cwd());
}

export async function POST(request: Request) {
  const admin = await isAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  try {
    const data = parseBody(body);
    await prisma.backlog.create({
      data: {
        order_num: data.order_num ?? undefined,
        sprint_number: data.sprint_number,
        sprint_status: data.sprint_status,
        short_description: data.short_description,
        description_prompt: data.description_prompt,
        task_status: data.task_status,
        task_type: data.task_type ?? undefined,
        modules: data.modules ?? undefined,
        components: data.components ?? undefined,
        complexity: data.complexity ?? undefined,
        doc_link: data.doc_link ?? undefined,
        test_order_or_link: data.test_order_or_link ?? undefined,
        prompt_about: data.prompt_about ?? undefined,
      },
    });
    await syncBacklogToDocs();
    revalidatePath("/admin");
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Validation error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
