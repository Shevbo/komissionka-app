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
  const env = await prisma.deploy_environments.findUnique({
    where: { id },
    include: {
      queue_items: {
        orderBy: { created_at: "desc" },
        take: 10,
      },
      log_entries: {
        orderBy: { created_at: "desc" },
        take: 20,
      },
    },
  });

  if (!env) {
    return NextResponse.json({ error: "Environment not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: env.id,
    name: env.name,
    port_app: env.port_app,
    port_agent: env.port_agent,
    port_bot: env.port_bot,
    directory: env.directory,
    db_name: env.db_name,
    branch: env.branch,
    status: env.status,
    is_prod: env.is_prod,
    created_at: env.created_at.toISOString(),
    updated_at: env.updated_at.toISOString(),
    queue_items: env.queue_items.map((q) => ({
      id: q.id,
      operation: q.operation,
      status: q.status,
      created_at: q.created_at.toISOString(),
    })),
    log_entries: env.log_entries.map((l) => ({
      id: l.id,
      operation: l.operation,
      status: l.status,
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
  const env = await prisma.deploy_environments.findUnique({ where: { id } });

  if (!env) {
    return NextResponse.json({ error: "Environment not found" }, { status: 404 });
  }

  if (env.is_prod) {
    return NextResponse.json({ error: "Cannot delete production environment" }, { status: 400 });
  }

  const runningOps = await prisma.deploy_queue.count({
    where: { environment_id: id, status: { in: ["pending", "running"] } },
  });
  if (runningOps > 0) {
    return NextResponse.json({ error: "Cannot delete: operations in progress" }, { status: 400 });
  }

  try {
    await prisma.deploy_queue.create({
      data: {
        environment_id: id,
        operation: "delete",
        status: "pending",
        requested_by: "admin",
      },
    });

    await prisma.deploy_environments.update({
      where: { id },
      data: { status: "deleting" },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to schedule deletion";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const admin = await isAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const env = await prisma.deploy_environments.findUnique({ where: { id } });

  if (!env) {
    return NextResponse.json({ error: "Environment not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  if (typeof b?.branch === "string") {
    updates.branch = b.branch.trim();
  }
  if (typeof b?.status === "string" && ["active", "stopped", "creating", "deleting"].includes(b.status)) {
    updates.status = b.status;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    await prisma.deploy_environments.update({
      where: { id },
      data: updates,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update environment";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
