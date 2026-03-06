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

const VALID_OPERATIONS = ["deploy", "create", "copy", "delete"] as const;
type Operation = (typeof VALID_OPERATIONS)[number];

export async function GET(request: Request) {
  const admin = await isAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const envId = searchParams.get("environment_id");
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));

  const where: Record<string, unknown> = {};
  if (status) {
    where.status = status;
  }
  if (envId) {
    where.environment_id = envId;
  }

  const items = await prisma.deploy_queue.findMany({
    where,
    orderBy: { created_at: "desc" },
    take: limit,
    include: {
      environment: {
        select: { name: true, is_prod: true },
      },
    },
  });

  return NextResponse.json({
    data: items.map((q) => ({
      id: q.id,
      environment_id: q.environment_id,
      environment_name: q.environment?.name ?? null,
      is_prod: q.environment?.is_prod ?? false,
      operation: q.operation,
      source_env_id: q.source_env_id,
      branch: q.branch,
      status: q.status,
      requested_by: q.requested_by,
      created_at: q.created_at.toISOString(),
      started_at: q.started_at?.toISOString() ?? null,
      completed_at: q.completed_at?.toISOString() ?? null,
    })),
  });
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

  const b = body as Record<string, unknown>;

  const environment_id = typeof b?.environment_id === "string" ? b.environment_id : null;
  const environment_name = typeof b?.environment_name === "string" ? b.environment_name.trim().toLowerCase() : null;

  let env;
  if (environment_id) {
    env = await prisma.deploy_environments.findUnique({ where: { id: environment_id } });
  } else if (environment_name) {
    env = await prisma.deploy_environments.findUnique({ where: { name: environment_name } });
  }

  if (!env) {
    return NextResponse.json({ error: "Environment not found" }, { status: 404 });
  }

  const operation = typeof b?.operation === "string" ? (b.operation as Operation) : null;
  if (!operation || !VALID_OPERATIONS.includes(operation)) {
    return NextResponse.json({ error: `Operation must be one of: ${VALID_OPERATIONS.join(", ")}` }, { status: 400 });
  }

  if (operation === "create" && env.status !== "stopped") {
    return NextResponse.json({ error: "Environment already exists or in progress" }, { status: 400 });
  }

  const branch = typeof b?.branch === "string" ? b.branch.trim() : env.branch;
  const source_env_id = typeof b?.source_env_id === "string" ? b.source_env_id : null;
  const requested_by = typeof b?.requested_by === "string" ? b.requested_by : "api";

  if (operation === "copy" && !source_env_id) {
    return NextResponse.json({ error: "source_env_id required for copy operation" }, { status: 400 });
  }

  const pendingOps = await prisma.deploy_queue.count({
    where: { environment_id: env.id, status: { in: ["pending", "running"] } },
  });
  if (pendingOps > 0 && operation !== "deploy") {
    return NextResponse.json({ error: "Another operation is already in progress for this environment" }, { status: 400 });
  }

  try {
    const queueItem = await prisma.deploy_queue.create({
      data: {
        environment_id: env.id,
        operation,
        source_env_id,
        branch,
        status: "pending",
        requested_by,
      },
    });

    return NextResponse.json({ ok: true, id: queueItem.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to queue operation";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
