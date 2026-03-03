import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";

async function isAdminRequest(request: Request): Promise<boolean> {
  const agentKey = request.headers.get("x-agent-api-key");
  if (agentKey && process.env.AGENT_API_KEY && agentKey === process.env.AGENT_API_KEY) {
    return true;
  }
  const session = await getServerSession(authOptions);
  const profile = session?.user?.id
    ? await prisma.profiles.findUnique({ where: { id: session.user.id }, select: { role: true } })
    : null;
  return profile?.role === "admin";
}

export async function POST(request: Request) {
  const admin = await isAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const { author_name, text, rating } = body; // Добавляем rating
  if (!author_name || typeof author_name !== "string" || !text || typeof text !== "string") {
    return NextResponse.json({ error: "author_name and text required" }, { status: 400 });
  }
  // Валидация рейтинга
  if (rating !== undefined && (typeof rating !== "number" || rating < 1 || rating > 5)) {
    return NextResponse.json({ error: "Rating must be a number between 1 and 5" }, { status: 400 });
  }
  await prisma.testimonials.create({
    data: { author_name: author_name.trim(), text: text.trim(), is_active: true, rating: rating ?? null }, // Сохраняем рейтинг
  });
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
