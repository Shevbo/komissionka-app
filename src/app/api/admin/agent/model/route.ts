import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";
import { ALL_AGENT_MODELS, isOpenRouterModel, resolveLegacyModelId } from "komiss/lib/agent-models";

/**
 * GET: список доступных моделей + выбранная.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const profile = session?.user?.id
    ? await prisma.profiles.findUnique({ where: { id: session.user.id }, select: { role: true } })
    : null;
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await prisma.site_settings.findUnique({ where: { id: "main" } });
  const raw = settings?.agent_llm_model ?? null;
  const selected = resolveLegacyModelId(raw) ?? raw;

  return NextResponse.json({
    models: ALL_AGENT_MODELS,
    selected,
    hasOpenRouterKey: !!(process.env.AGENT_OPENROUTER_API_KEY?.trim()),
  });
}

/**
 * PATCH: установить выбранную модель.
 */
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  const profile = session?.user?.id
    ? await prisma.profiles.findUnique({ where: { id: session.user.id }, select: { role: true } })
    : null;
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { model?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const model = typeof body.model === "string" ? body.model.trim() : null;

  if (model && isOpenRouterModel(model) && !process.env.AGENT_OPENROUTER_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "Для Claude через OpenRouter добавьте AGENT_OPENROUTER_API_KEY в .env. См. docs/AGENT-CLAUDE-OPENROUTER.md" },
      { status: 400 }
    );
  }

  await prisma.site_settings.upsert({
    where: { id: "main" },
    create: { id: "main", key: "main", agent_llm_model: model },
    update: { agent_llm_model: model ?? undefined },
  });

  return NextResponse.json({ ok: true, model });
}
