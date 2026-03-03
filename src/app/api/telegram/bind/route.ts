import { NextResponse } from "next/server";
import { prisma } from "komiss/lib/prisma";

/** POST: подтвердить привязку Telegram по одноразовому коду (вызывается ботом). */
export async function POST(request: Request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("X-Telegram-Bot-Token");
  if (!token || token !== process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { code?: string; telegram_id?: string | number; telegram_username?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  const telegramId = body.telegram_id != null ? String(body.telegram_id) : "";
  const telegramUsername = typeof body.telegram_username === "string" ? body.telegram_username.trim() || null : null;

  if (!code || !telegramId) {
    return NextResponse.json({ error: "code and telegram_id required" }, { status: 400 });
  }

  const row = await prisma.telegram_bind_code.findUnique({
    where: { code },
    select: { profile_id: true, expires_at: true },
  });

  if (!row) {
    return NextResponse.json({ error: "Код не найден или уже использован." }, { status: 404 });
  }
  if (row.expires_at < new Date()) {
    await prisma.telegram_bind_code.delete({ where: { code } }).catch(() => {});
    return NextResponse.json({ error: "Код истёк. Получите новый в админке." }, { status: 410 });
  }

  const profile = await prisma.profiles.findUnique({
    where: { id: row.profile_id },
    select: { role: true },
  });
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.$transaction([
    prisma.profiles.update({
      where: { id: row.profile_id },
      data: { telegram_id: telegramId, telegram_username: telegramUsername },
    }),
    prisma.telegram_bind_code.delete({ where: { code } }),
  ]);

  return NextResponse.json({ ok: true, message: "Telegram привязан. Можете отправлять промпты." });
}
