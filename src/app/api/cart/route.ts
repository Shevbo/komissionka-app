import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ items: [] });
  }
  const rows = await prisma.cart_items.findMany({
    where: { user_id: session.user.id },
    include: {
      items: {
        select: { id: true, title: true, price: true, image_url: true, location: true },
      },
    },
  });
  const items = rows
    .filter((r) => r.items)
    .map((r) => ({
      id: r.items!.id,
      title: r.items!.title,
      price: r.items!.price == null ? null : Number(r.items!.price),
      image_urls: r.items!.image_url ? [r.items!.image_url] : [],
      location: r.items!.location,
    }));
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const product_id = body?.product_id;
  if (!product_id || typeof product_id !== "string") {
    return NextResponse.json({ error: "product_id required" }, { status: 400 });
  }
  await prisma.cart_items.upsert({
    where: {
      user_id_product_id: { user_id: session.user.id, product_id },
    },
    create: { user_id: session.user.id, product_id },
    update: {},
  });
  return NextResponse.json({ ok: true });
}
