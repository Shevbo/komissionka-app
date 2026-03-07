import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const AGENT_LOGS_DIR = ".agent-logs";

/** Допустимые символы в logId (без path traversal). */
const LOG_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

/** Корень проекта: совпадает с агентом (AGENT_ROOT), чтобы читать те же .agent-logs. */
function getLogsRoot(): string {
  const env = process.env.PROJECT_ROOT ?? process.env.AGENT_ROOT;
  return env ? resolve(env) : process.cwd();
}

/**
 * GET ?logId=xxx — возвращает содержимое файла с полным логом рассуждений ИИ по этому запросу.
 * Только для admin. Файл: .agent-logs/<logId>.log. Возвращаем только лог по logId, без подстановки
 * last-reasoning.txt (чтобы не показывать ход рассуждений от другого промпта).
 */
export async function GET(req: Request) {
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

  const { searchParams } = new URL(req.url);
  const logId = searchParams.get("logId");
  if (!logId || !LOG_ID_REGEX.test(logId)) {
    return NextResponse.json({ error: "Invalid or missing logId" }, { status: 400 });
  }

  const root = getLogsRoot();
  const dir = join(root, AGENT_LOGS_DIR);
  const filePath = join(dir, `${logId}.log`);

  if (!existsSync(filePath)) {
    return NextResponse.json(
      { error: "Log not found", message: "Лог для этого запроса не найден. Возможно, создан в другой среде или удалён." },
      { status: 404 }
    );
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `inline; filename="${logId}.log"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to read log" }, { status: 500 });
  }
}
