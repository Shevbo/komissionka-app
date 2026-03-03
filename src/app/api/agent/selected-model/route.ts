/**
 * GET: возвращает выбранную модель ИИ для агента/бота.
 * Защита: заголовок Authorization: Bearer <AGENT_API_KEY> или X-Agent-API-Key.
 */
import { NextResponse } from "next/server";
import { prisma } from "komiss/lib/prisma";
import { isOpenRouterModel, resolveLegacyModelId } from "komiss/lib/agent-models";

function checkAuth(req: Request): boolean {
  const apiKey = process.env.AGENT_API_KEY?.trim();
  if (!apiKey) return true; // без ключа — только для локальной разработки

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7) === apiKey;

  const xKey = req.headers.get("x-agent-api-key");
  return xKey === apiKey;
}

export async function GET(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await prisma.site_settings.findUnique({ where: { id: "main" } });
  const raw = settings?.agent_llm_model?.trim() ?? null;
  const model = resolveLegacyModelId(raw) ?? raw;
  const mode = (settings?.agent_mode?.trim() ?? "consult") as "chat" | "consult" | "dev";
  const validMode = mode === "chat" || mode === "consult" || mode === "dev" ? mode : "consult";

  if (!model) {
    return NextResponse.json({
      model: null,
      baseUrl: null,
      apiKey: null,
      provider: "env",
      mode: validMode,
    });
  }

  const provider = isOpenRouterModel(model) ? "openrouter" : "google";
  const baseUrl =
    provider === "openrouter"
      ? "https://openrouter.ai/api/v1"
      : process.env.AGENT_LLM_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai";
  const apiKey =
    provider === "openrouter"
      ? process.env.AGENT_OPENROUTER_API_KEY
      : process.env.AGENT_LLM_API_KEY;

  return NextResponse.json({
    model,
    baseUrl,
    apiKey: apiKey ?? null,
    provider,
    mode: validMode,
  });
}
