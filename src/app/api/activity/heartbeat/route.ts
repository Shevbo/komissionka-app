import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const user_id = session?.user?.id;

    if (!user_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.profiles.updateMany({
      where: { id: user_id },
      data: { last_active_at: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("API activity heartbeat error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
