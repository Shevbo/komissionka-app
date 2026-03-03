import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const AGENT_LOGS_DIR = ".agent-logs";

/** Допустимые символы в logId (без path traversal). */
const LOG_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * GET ?logId=xxx — возвращает содержимое файла с полным логом рассуждений ИИ.
 * Только для admin. Файл: .agent-logs/<logId>.log в корне проекта.
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

  const root = process.cwd();
  const filePath = join(root, AGENT_LOGS_DIR, `${logId}.log`);
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Log not found" }, { status: 404 });
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
