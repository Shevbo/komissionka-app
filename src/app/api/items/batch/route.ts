import { NextResponse } from "next/server";
import { prisma } from "komiss/lib/prisma";

/** POST { ids: string[] } — для больших списков (избегаем 414 URI Too Long в GET). */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    const idList = ids.map((s: unknown) => String(s).trim()).filter(Boolean);
    if (idList.length === 0) return NextResponse.json({ items: [] });

    const rows = await prisma.items.findMany({
      where: { id: { in: idList } },
      include: { users: { include: { profiles: { select: { full_name: true } } } } },
    });
    return NextResponse.json({
      items: rows.map((i) => ({
        id: i.id,
        title: i.title,
        image_url: i.image_url ?? null,
        image_urls: i.image_urls ?? [],
        price: i.price == null ? null : Number(i.price),
        author_name: i.users?.profiles?.full_name ?? null,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Invalid request", items: [] }, { status: 400 });
  }
}
