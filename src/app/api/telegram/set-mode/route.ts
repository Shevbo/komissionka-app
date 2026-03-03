/**
 * POST: установить режим агента (вызывается ботом). Auth: Bearer TELEGRAM_BOT_TOKEN.
 * Body: { mode: string, telegram_id: number } — только для admin с этим telegram_id.
 */
import { NextResponse } from "next/server";
import { prisma } from "komiss/lib/prisma";

function checkAuth(req: Request): boolean {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? req.headers.get("X-Telegram-Bot-Token");
  return !!token && token === process.env.TELEGRAM_BOT_TOKEN;
}

const MODE_LABELS: Record<string, string> = {
  chat: "Курилка",
  consult: "Консультация",
  dev: "Разработка",
};

export async function POST(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { mode?: string; telegram_id?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const telegramId = body.telegram_id != null ? String(body.telegram_id) : "";
  const mode = typeof body.mode === "string" ? body.mode.trim().toLowerCase() : "";

  if (!telegramId) {
    return NextResponse.json({ error: "telegram_id required" }, { status: 400 });
  }

  const profile = await prisma.profiles.findFirst({
    where: { telegram_id: telegramId, role: "admin" },
    select: { id: true },
  });

  if (!profile) {
    return NextResponse.json({ error: "Forbidden: только для администраторов с привязанным Telegram" }, { status: 403 });
  }

  const validModes = ["chat", "consult", "dev"];
  if (!validModes.includes(mode)) {
    return NextResponse.json({ error: "Режим должен быть: chat, consult или dev" }, { status: 400 });
  }

  await prisma.site_settings.upsert({
    where: { id: "main" },
    create: { id: "main", key: "main", agent_mode: mode },
    update: { agent_mode: mode },
  });

  return NextResponse.json({ ok: true, mode, label: MODE_LABELS[mode] });
}
