import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";

async function requireAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const profile = session?.user?.id
    ? await prisma.profiles.findUnique({ where: { id: session.user.id }, select: { role: true } })
    : null;
  return profile?.role === "admin";
}

export async function GET() {
  const ok = await requireAdmin();
  if (!ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rows = await prisma.test_modules.findMany({
    where: { active: true },
    orderBy: { id: "asc" },
  });
  return NextResponse.json({
    data: rows.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      active: m.active,
    })),
  });
}
