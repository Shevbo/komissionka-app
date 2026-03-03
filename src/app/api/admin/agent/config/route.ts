import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";

/**
 * GET: возвращает фактическую модель агента (с учётом AGENT_LLM_MODE=FAST и AGENT_LLM_MODEL_FAST).
 */
export async function GET() {
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

  const mode = (process.env.AGENT_LLM_MODE ?? "").toUpperCase();
  let model =
    mode === "FAST"
      ? (process.env.AGENT_LLM_MODEL_FAST ?? "").trim() || "gemini-2.5-flash"
      : (process.env.AGENT_LLM_MODEL ?? "").trim();
  if (model === "gemini-2.0-flash" || model === "models/gemini-2.0-flash") model = "gemini-2.5-flash";
  return NextResponse.json({
    model: model || "не задана (AGENT_LLM_MODEL / AGENT_LLM_MODEL_FAST)",
  });
}
