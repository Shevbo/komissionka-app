/**
 * GET: текущий режим агента (для бота). Auth: Bearer TELEGRAM_BOT_TOKEN.
 */
import { NextResponse } from "next/server";
import { prisma } from "komiss/lib/prisma";
import { getModeLabel } from "komiss/lib/agent-mode-labels";

function checkAuth(req: Request): boolean {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? req.headers.get("X-Telegram-Bot-Token");
  return !!token && token === process.env.TELEGRAM_BOT_TOKEN;
}

export async function GET(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await prisma.site_settings.findUnique({ where: { id: "main" } });
  const mode = (settings?.agent_mode?.trim() ?? "consult") as string;
  const validMode = mode === "chat" || mode === "consult" || mode === "dev" ? mode : "consult";

  return NextResponse.json({
    mode: validMode,
    label: getModeLabel(validMode),
  });
}
