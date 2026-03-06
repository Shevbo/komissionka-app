import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

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

interface PM2Process {
  name: string;
  pm_id: number;
  status: string;
  cpu: number;
  memory: number;
  uptime: number;
}

async function getPM2Status(): Promise<PM2Process[]> {
  try {
    const { stdout } = await execAsync("pm2 jlist", { timeout: 10000 });
    const processes = JSON.parse(stdout);
    return processes.map((p: Record<string, unknown>) => ({
      name: p.name,
      pm_id: p.pm_id,
      status: (p.pm2_env as Record<string, unknown>)?.status ?? "unknown",
      cpu: (p.monit as Record<string, number>)?.cpu ?? 0,
      memory: (p.monit as Record<string, number>)?.memory ?? 0,
      uptime: (p.pm2_env as Record<string, number>)?.pm_uptime ?? 0,
    }));
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const admin = await isAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [environments, pendingOps, pm2Processes] = await Promise.all([
    prisma.deploy_environments.findMany({
      orderBy: [{ is_prod: "desc" }, { name: "asc" }],
    }),
    prisma.deploy_queue.findMany({
      where: { status: { in: ["pending", "running"] } },
      orderBy: { created_at: "asc" },
      include: { environment: { select: { name: true } } },
    }),
    getPM2Status(),
  ]);

  const envStatus = environments.map((env) => {
    const envProcesses = pm2Processes.filter(
      (p) =>
        p.name === `komissionka${env.is_prod ? "" : `-${env.name}`}` ||
        p.name === `agent${env.is_prod ? "" : `-${env.name}`}` ||
        p.name === `bot${env.is_prod ? "" : `-${env.name}`}`
    );

    const activeOp = pendingOps.find((op) => op.environment_id === env.id);

    return {
      id: env.id,
      name: env.name,
      is_prod: env.is_prod,
      status: env.status,
      branch: env.branch,
      port_app: env.port_app,
      processes: envProcesses,
      active_operation: activeOp
        ? {
            id: activeOp.id,
            operation: activeOp.operation,
            status: activeOp.status,
            created_at: activeOp.created_at.toISOString(),
          }
        : null,
    };
  });

  const queueSummary = {
    pending: pendingOps.filter((op) => op.status === "pending").length,
    running: pendingOps.filter((op) => op.status === "running").length,
    items: pendingOps.map((op) => ({
      id: op.id,
      environment_name: op.environment?.name ?? null,
      operation: op.operation,
      status: op.status,
      created_at: op.created_at.toISOString(),
    })),
  };

  return NextResponse.json({
    environments: envStatus,
    queue: queueSummary,
    pm2_processes: pm2Processes,
  });
}
