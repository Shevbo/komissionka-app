import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";

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

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const admin = await isAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const item = await prisma.deploy_queue.findUnique({
    where: { id },
    include: {
      environment: { select: { name: true, is_prod: true } },
      log_entries: { orderBy: { created_at: "desc" }, take: 10 },
    },
  });

  if (!item) {
    return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: item.id,
    environment_id: item.environment_id,
    environment_name: item.environment?.name ?? null,
    is_prod: item.environment?.is_prod ?? false,
    operation: item.operation,
    source_env_id: item.source_env_id,
    branch: item.branch,
    status: item.status,
    requested_by: item.requested_by,
    created_at: item.created_at.toISOString(),
    started_at: item.started_at?.toISOString() ?? null,
    completed_at: item.completed_at?.toISOString() ?? null,
    log_entries: item.log_entries.map((l) => ({
      id: l.id,
      status: l.status,
      output: l.output,
      error: l.error,
      duration_ms: l.duration_ms,
      created_at: l.created_at.toISOString(),
    })),
  });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const admin = await isAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const item = await prisma.deploy_queue.findUnique({ where: { id } });

  if (!item) {
    return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
  }

  if (item.status === "running") {
    return NextResponse.json({ error: "Cannot cancel running operation" }, { status: 400 });
  }

  if (item.status !== "pending") {
    return NextResponse.json({ error: "Can only cancel pending operations" }, { status: 400 });
  }

  try {
    await prisma.deploy_queue.update({
      where: { id },
      data: {
        status: "cancelled",
        completed_at: new Date(),
      },
    });

    await prisma.deploy_log.create({
      data: {
        queue_id: id,
        environment_id: item.environment_id,
        operation: item.operation,
        status: "cancelled",
        output: "Operation cancelled by user",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to cancel operation";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
