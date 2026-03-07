import { NextResponse } from "next/server";
import { prisma } from "komiss/lib/prisma";

/**
 * Добавление записи в журнал деплоя из скриптов (deploy-from-git.sh, env-deploy.sh).
 * Вызывается только с сервера с секретом DEPLOY_LOG_SECRET.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-deploy-log-secret");
  const expected = process.env.DEPLOY_LOG_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const operation = typeof b?.operation === "string" ? b.operation.trim() : "";
  const environment_name = typeof b?.environment_name === "string" ? b.environment_name.trim().toLowerCase() : "";
  const status = typeof b?.status === "string" ? b.status.trim() : "completed";
  const output = typeof b?.output === "string" ? b.output.slice(0, 50000) : null;
  const error = typeof b?.error === "string" ? b.error.slice(0, 10000) : null;
  const duration_ms = typeof b?.duration_ms === "number" ? b.duration_ms : typeof b?.duration_ms === "string" ? parseInt(b.duration_ms, 10) : null;
  const requested_by = typeof b?.requested_by === "string" ? b.requested_by.slice(0, 255) : "script";

  if (!operation || !environment_name) {
    return NextResponse.json({ error: "operation and environment_name required" }, { status: 400 });
  }

  const env = await prisma.deploy_environments.findUnique({
    where: { name: environment_name },
    select: { id: true },
  });
  const environment_id = env?.id ?? null;

  try {
    const log = await prisma.deploy_log.create({
      data: {
        operation,
        status,
        output: output ?? undefined,
        error: error ?? undefined,
        duration_ms: duration_ms ?? undefined,
        environment_id,
        source: "script",
        requested_by: requested_by || "script",
      },
    });
    return NextResponse.json({ ok: true, id: log.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to append log";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
