import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const AGENT_LOGS_DIR = ".agent-logs";
const LAST_REASONING_FILE = "last-reasoning.txt";

/** Допустимые символы в logId (без path traversal). */
const LOG_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

/** Корень проекта: совпадает с агентом (AGENT_ROOT), чтобы читать те же .agent-logs. */
function getLogsRoot(): string {
  const env = process.env.PROJECT_ROOT ?? process.env.AGENT_ROOT;
  return env ? resolve(env) : process.cwd();
}

/**
 * GET ?logId=xxx — возвращает содержимое файла с полным логом рассуждений ИИ.
 * Только для admin. Файл: .agent-logs/<logId>.log. Если файла нет — отдаём last-reasoning.txt (последний ход).
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
  const fallbackPath = join(dir, LAST_REASONING_FILE);

  let content: string;
  let filename: string;
  if (existsSync(filePath)) {
    try {
      content = readFileSync(filePath, "utf-8");
      filename = `${logId}.log`;
    } catch {
      return NextResponse.json({ error: "Failed to read log" }, { status: 500 });
    }
  } else if (existsSync(fallbackPath)) {
    try {
      content = `[Файл ${logId}.log не найден — показан последний сохранённый ход рассуждений]\n\n${readFileSync(fallbackPath, "utf-8")}`;
      filename = LAST_REASONING_FILE;
    } catch {
      return NextResponse.json({ error: "Failed to read fallback log" }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: "Log not found" }, { status: 404 });
  }

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
