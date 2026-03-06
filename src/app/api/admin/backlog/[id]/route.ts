import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
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

const SPRINT_STATUSES = ["формируется", "выполняется", "реализован", "архив"] as const;
const TASK_STATUSES = ["не начато", "выполняется", "тестируется", "сделано", "отказ"] as const;

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await isAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const existing = await prisma.backlog.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const update: {
    order_num?: number | null;
    sprint_number?: number;
    sprint_status?: string;
    short_description?: string;
    description_prompt?: string;
    task_status?: string;
    doc_link?: string | null;
    test_order_or_link?: string | null;
    prompt_about?: string | null;
    status_changed_at?: Date;
  } = {};
  if (body.order_num !== undefined) {
    update.order_num = body.order_num == null ? null : Number(body.order_num);
  }
  if (body.sprint_number !== undefined) {
    const v = Number(body.sprint_number);
    if (!Number.isNaN(v) && v >= 0) update.sprint_number = v;
  }
  if (body.sprint_status !== undefined) {
    const s = String(body.sprint_status).trim();
    if (SPRINT_STATUSES.includes(s as (typeof SPRINT_STATUSES)[number])) update.sprint_status = s;
  }
  if (body.short_description !== undefined) {
    const s = String(body.short_description).trim();
    if (s) update.short_description = s;
  }
  if (body.description_prompt !== undefined) {
    update.description_prompt = String(body.description_prompt);
  }
  if (body.task_status !== undefined) {
    const s = String(body.task_status).trim();
    if (TASK_STATUSES.includes(s as (typeof TASK_STATUSES)[number])) {
      update.task_status = s;
      update.status_changed_at = new Date();
    }
  }
  if (body.doc_link !== undefined) {
    update.doc_link = body.doc_link == null || body.doc_link === "" ? null : String(body.doc_link).trim();
  }
  if (body.test_order_or_link !== undefined) {
    update.test_order_or_link =
      body.test_order_or_link == null || body.test_order_or_link === ""
        ? null
        : String(body.test_order_or_link).trim();
  }
  if (body.prompt_about !== undefined) {
    update.prompt_about = body.prompt_about == null || body.prompt_about === "" ? null : String(body.prompt_about).trim();
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true });
  }
  await prisma.backlog.update({ where: { id }, data: update });
  await syncBacklogToDocs();
  revalidatePath("/admin");
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await isAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.backlog.delete({ where: { id } });
  await syncBacklogToDocs();
  revalidatePath("/admin");
  return NextResponse.json({ ok: true });
}
