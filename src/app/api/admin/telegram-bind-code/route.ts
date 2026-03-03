import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";

const CODE_PREFIX = "КОМ-";
const CODE_LENGTH = 6;
const EXPIRES_MINUTES = 10;

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return CODE_PREFIX + s;
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const profile = await prisma.profiles.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + EXPIRES_MINUTES * 60 * 1000);

  await prisma.telegram_bind_code.upsert({
    where: { code },
    create: { code, profile_id: session.user.id, expires_at: expiresAt },
    update: { expires_at: expiresAt },
  });

  return NextResponse.json({ code, expires_minutes: EXPIRES_MINUTES });
}
