import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const item_id = searchParams.get("item_id");
  if (!item_id) {
    return NextResponse.json({ error: "item_id required" }, { status: 400 });
  }
  const list = await prisma.messages.findMany({
    where: { item_id },
    orderBy: { created_at: "asc" },
  });
  return NextResponse.json({
    messages: list.map((m) => {
      const att = (m as { attachments?: unknown }).attachments;
      const attachments = Array.isArray(att) ? att : att != null ? [att] : [];
      return {
        id: m.id,
        item_id: m.item_id,
        author_name: m.author_name,
        content: m.content,
        attachments,
        created_at: m.created_at?.toISOString() ?? null,
      };
    }),
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const { item_id, content, author_name, attachments } = body;
  if (!item_id || typeof content !== "string") {
    return NextResponse.json({ error: "item_id and content required" }, { status: 400 });
  }
  const attArr = Array.isArray(attachments) ? attachments.filter((a: unknown) => typeof a === "string") : [];

  const userExists = await prisma.users.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });
  if (!userExists) {
    return NextResponse.json(
      { error: "Сессия устарела. Войдите заново." },
      { status: 401 }
    );
  }

  try {
    const msg = await prisma.messages.create({
      data: {
        content: content.trim(),
        author_name: typeof author_name === "string" ? author_name : "Гость",
        attachments: attArr,
        items: { connect: { id: item_id } },
        users: { connect: { id: session.user.id } },
      } as Parameters<typeof prisma.messages.create>[0]["data"],
    });

    const msgAtt = (msg as { attachments?: unknown }).attachments;
    return NextResponse.json({
      id: msg.id,
      item_id: msg.item_id,
      author_name: msg.author_name,
      content: msg.content,
      attachments: Array.isArray(msgAtt) ? msgAtt : attArr,
      created_at: msg.created_at?.toISOString() ?? null,
    });
  } catch (err) {
    console.error("Messages POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ошибка отправки" },
      { status: 500 }
    );
  }
}
