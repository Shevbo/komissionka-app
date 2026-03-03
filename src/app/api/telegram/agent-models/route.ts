/**
 * GET: список моделей + выбранная (для бота). Auth: Bearer TELEGRAM_BOT_TOKEN.
 */
import { NextResponse } from "next/server";
import { prisma } from "komiss/lib/prisma";
import { ALL_AGENT_MODELS, resolveLegacyModelId } from "komiss/lib/agent-models";

function checkAuth(req: Request): boolean {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? req.headers.get("X-Telegram-Bot-Token");
  return !!token && token === process.env.TELEGRAM_BOT_TOKEN;
}

export async function GET(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await prisma.site_settings.findUnique({ where: { id: "main" } });
  const raw = settings?.agent_llm_model?.trim() ?? null;
  const selected = resolveLegacyModelId(raw) ?? raw;

  return NextResponse.json({
    models: ALL_AGENT_MODELS,
    selected,
  });
}
