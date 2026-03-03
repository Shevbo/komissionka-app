import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json().catch(() => ({}));
    const { action_type, details = {}, page_url = null } = body;
    let user_id = body.user_id ?? session?.user?.id ?? null;

    if (!action_type || typeof action_type !== "string") {
      return NextResponse.json(
        { error: "action_type is required" },
        { status: 400 }
      );
    }

    const detailsObj =
      details && typeof details === "object" && !Array.isArray(details)
        ? details
        : {};

    if (user_id) {
      const userExists = await prisma.users.findUnique({
        where: { id: user_id },
        select: { id: true },
      });
      if (!userExists) user_id = null;
    }

    await prisma.user_activity.create({
      data: {
        user_id,
        action_type,
        page_url: page_url ?? undefined,
        details: detailsObj as object,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("API activity error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
