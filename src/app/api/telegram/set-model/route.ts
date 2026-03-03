/**
 * POST: установить модель (вызывается ботом). Auth: Bearer TELEGRAM_BOT_TOKEN.
 * Body: { model: string, telegram_id: number } — только для admin-профиля с этим telegram_id.
 */
import { NextResponse } from "next/server";
import { prisma } from "komiss/lib/prisma";
import { isOpenRouterModel, getModelById } from "komiss/lib/agent-models";

function checkAuth(req: Request): boolean {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? req.headers.get("X-Telegram-Bot-Token");
  return !!token && token === process.env.TELEGRAM_BOT_TOKEN;
}

export async function POST(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { model?: string; telegram_id?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const telegramId = body.telegram_id != null ? String(body.telegram_id) : "";
  const model = (typeof body.model === "string" ? body.model.trim() : null) || null;

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

  if (model) {
    const exists = getModelById(model);
    if (!exists) {
      return NextResponse.json({ error: "Модель не найдена в списке" }, { status: 400 });
    }
    if (isOpenRouterModel(model) && !process.env.AGENT_OPENROUTER_API_KEY?.trim()) {
      return NextResponse.json(
        { error: "Для Claude добавьте AGENT_OPENROUTER_API_KEY в .env" },
        { status: 400 }
      );
    }
  }

  await prisma.site_settings.upsert({
    where: { id: "main" },
    create: { id: "main", key: "main", agent_llm_model: model },
    update: { agent_llm_model: model },
  });

  const displayName = model ? getModelById(model)?.name ?? model : "из .env (по умолчанию)";
  return NextResponse.json({ ok: true, model, displayName });
}
