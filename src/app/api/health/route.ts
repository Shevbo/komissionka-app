/**
 * Диагностика: БД, загрузки, переменные окружения (без секретов).
 */
import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import path from "node:path";

const UPLOADS_DIR =
  process.env.UPLOADS_AGENT_DIR ||
  path.join(process.cwd(), "public", "uploads", "agent");

export async function GET() {
  const checks: Record<string, unknown> = {
    cwd: process.cwd(),
    uploadsDir: process.env.UPLOADS_AGENT_DIR ? "from env" : "from cwd",
    uploadsPath: UPLOADS_DIR,
    uploadsExists: existsSync(UPLOADS_DIR),
  };
  try {
    const { prisma } = await import("komiss/lib/prisma");
    const itemCount = await prisma.items.count();
    const settings = await prisma.site_settings.findUnique({
      where: { id: "main" },
      select: { id: true },
    });
    checks.db = { ok: true, itemsCount: itemCount, settings: !!settings };
  } catch (e) {
    checks.db = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
  return NextResponse.json(checks);
}
