/**
 * GET /api/admin/agent/diagnose — выполняет на сервере pm2 list, curl health, pm2 logs agent --lines 100
 * и возвращает вывод. Только для admin. Используется при ошибке «Не удалось отправить запрос к агенту».
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { execSync, spawnSync } from "node:child_process";

const AGENT_PORT = process.env.AGENT_PORT ?? "3140";
const RUN_TIMEOUT_MS = 8000;

function run(cmd: string): { stdout: string; stderr: string; error?: string } {
  try {
    const r = execSync(cmd, {
      encoding: "utf8",
      timeout: RUN_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
    return { stdout: (r ?? "").trim(), stderr: "" };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return {
      stdout: (err.stdout ?? "").trim(),
      stderr: (err.stderr ?? "").trim(),
      error: err.message ?? String(e),
    };
  }
}

/** pm2 logs стримит по умолчанию; с --nostream выводит и выходит. Если флаг не поддерживается — запускаем с таймаутом. */
function runPm2Logs(): string {
  const withNostream = spawnSync("pm2", ["logs", "agent", "--lines", "100", "--nostream"], {
    encoding: "utf8",
    timeout: RUN_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
  });
  const out = (withNostream.stdout ?? "").trim() || (withNostream.stderr ?? "").trim();
  if (out && !/unknown option|Unknown option|invalid/i.test(out)) {
    return out;
  }
  const fallback = spawnSync("pm2", ["logs", "agent", "--lines", "100"], {
    encoding: "utf8",
    timeout: 4000,
    maxBuffer: 512 * 1024,
  });
  return (fallback.stdout ?? "").trim() || (fallback.stderr ?? "").trim() || "(таймаут или пусто)";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const profile = session?.user?.id
    ? await prisma.profiles.findUnique({
        where: { id: session.user.id },
        select: { role: true },
      })
    : null;
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pm2 = run("pm2 list");
  const health = run(`curl -s http://127.0.0.1:${AGENT_PORT}/health`);
  const logsOut = runPm2Logs();

  const pm2Out = pm2.stdout || pm2.stderr || (pm2.error ? `Error: ${pm2.error}` : "");
  const healthOut = health.stdout || health.stderr || (health.error ? `Error: ${health.error}` : "");

  const text = [
    "1) pm2 list:",
    "---",
    pm2Out || "(пусто)",
    "",
    "2) curl -s http://127.0.0.1:" + AGENT_PORT + "/health:",
    "---",
    healthOut || "(пусто)",
    "",
    "3) pm2 logs agent --lines 100:",
    "---",
    logsOut || "(пусто)",
  ].join("\n");

  return NextResponse.json({ ok: true, output: text, pm2List: pm2Out, health: healthOut, logs: logsOut });
}
