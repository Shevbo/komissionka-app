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

export async function GET(request: Request) {
  const admin = await isAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("environment_id");
  const operation = searchParams.get("operation");
  const status = searchParams.get("status");
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));

  const where: Record<string, unknown> = {};
  if (envId) where.environment_id = envId;
  if (operation) where.operation = operation;
  if (status) where.status = status;

  const [logs, total] = await Promise.all([
    prisma.deploy_log.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: offset,
      take: limit,
      include: {
        environment: { select: { name: true } },
        queue: { select: { requested_by: true, branch: true } },
      },
    }),
    prisma.deploy_log.count({ where }),
  ]);

  return NextResponse.json({
    data: logs.map((l) => ({
      id: l.id,
      queue_id: l.queue_id,
      environment_id: l.environment_id,
      environment_name: l.environment?.name ?? null,
      operation: l.operation,
      status: l.status,
      output: l.output,
      error: l.error,
      duration_ms: l.duration_ms,
      source: l.source ?? "queue",
      requested_by: l.requested_by ?? l.queue?.requested_by ?? null,
      branch: l.queue?.branch ?? null,
      created_at: l.created_at.toISOString(),
    })),
    total,
    limit,
    offset,
  });
}
