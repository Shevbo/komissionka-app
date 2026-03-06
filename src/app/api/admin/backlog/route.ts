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

function parseBody(body: unknown): {
  order_num?: number | null;
  sprint_number: number;
  sprint_status: string;
  short_description: string;
  description_prompt: string;
  task_status: string;
  doc_link?: string | null;
  test_order_or_link?: string | null;
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
  return {
    order_num: Number.isNaN(order_num) ? null : order_num,
    sprint_number,
    sprint_status,
    short_description,
    description_prompt,
    task_status,
    doc_link,
    test_order_or_link,
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
    doc_link: r.doc_link,
    test_order_or_link: r.test_order_or_link,
    created_at: r.created_at?.toISOString() ?? null,
    status_changed_at: r.status_changed_at?.toISOString() ?? null,
  }));
  const rootDir = process.cwd();
  syncBacklogToDoc(list, rootDir);
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
        doc_link: data.doc_link ?? undefined,
        test_order_or_link: data.test_order_or_link ?? undefined,
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
