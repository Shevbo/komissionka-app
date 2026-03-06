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

  const source_name = typeof b?.source === "string" ? b.source.trim().toLowerCase() : null;
  const target_name = typeof b?.target === "string" ? b.target.trim().toLowerCase() : null;

  if (!source_name || !target_name) {
    return NextResponse.json({ error: "source and target environment names are required" }, { status: 400 });
  }

  if (source_name === target_name) {
    return NextResponse.json({ error: "source and target cannot be the same" }, { status: 400 });
  }

  const [sourceEnv, targetEnv] = await Promise.all([
    prisma.deploy_environments.findUnique({ where: { name: source_name } }),
    prisma.deploy_environments.findUnique({ where: { name: target_name } }),
  ]);

  if (!sourceEnv) {
    return NextResponse.json({ error: `Source environment '${source_name}' not found` }, { status: 404 });
  }
  if (!targetEnv) {
    return NextResponse.json({ error: `Target environment '${target_name}' not found` }, { status: 404 });
  }

  if (sourceEnv.status !== "active") {
    return NextResponse.json({ error: "Source environment must be active" }, { status: 400 });
  }

  const pendingOps = await prisma.deploy_queue.count({
    where: { environment_id: targetEnv.id, status: { in: ["pending", "running"] } },
  });
  if (pendingOps > 0) {
    return NextResponse.json({ error: "Target environment has operations in progress" }, { status: 400 });
  }

  const copy_db = b?.copy_db !== false;
  const requested_by = typeof b?.requested_by === "string" ? b.requested_by : "admin";

  try {
    const queueItem = await prisma.deploy_queue.create({
      data: {
        environment_id: targetEnv.id,
        operation: "copy",
        source_env_id: sourceEnv.id,
        branch: sourceEnv.branch,
        status: "pending",
        requested_by,
      },
    });

    await prisma.deploy_environments.update({
      where: { id: targetEnv.id },
      data: { status: "creating" },
    });

    return NextResponse.json({
      ok: true,
      queue_id: queueItem.id,
      message: `Queued copy from '${source_name}' to '${target_name}'${copy_db ? " (including DB)" : ""}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to queue copy operation";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
