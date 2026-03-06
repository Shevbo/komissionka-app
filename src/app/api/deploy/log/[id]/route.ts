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
  const log = await prisma.deploy_log.findUnique({
    where: { id },
    include: {
      environment: { select: { name: true, is_prod: true } },
      queue: { select: { operation: true, branch: true, requested_by: true, source_env_id: true } },
    },
  });

  if (!log) {
    return NextResponse.json({ error: "Log entry not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: log.id,
    queue_id: log.queue_id,
    environment_id: log.environment_id,
    environment_name: log.environment?.name ?? null,
    is_prod: log.environment?.is_prod ?? false,
    operation: log.operation,
    status: log.status,
    output: log.output,
    error: log.error,
    duration_ms: log.duration_ms,
    branch: log.queue?.branch ?? null,
    requested_by: log.queue?.requested_by ?? null,
    source_env_id: log.queue?.source_env_id ?? null,
    created_at: log.created_at.toISOString(),
  });
}
