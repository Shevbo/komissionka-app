import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ids = searchParams.get("ids"); // comma-separated for admin/activity (короткие списки)
  if (ids) {
    const idList = ids.split(",").map((s) => s.trim()).filter(Boolean);
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
  }
  const session = await getServerSession(authOptions);
  const isAdmin = (await prisma.profiles.findUnique({
    where: { id: session?.user?.id ?? "" },
    select: { role: true },
  }))?.role === "admin";
  if (isAdmin) {
    const list = await prisma.items.findMany({
      orderBy: { created_at: "desc" },
      select: { id: true, title: true, price: true, status: true, created_at: true, image_url: true, image_urls: true }, // Выбираем image_urls
    });
    return NextResponse.json({
      items: list.map((i) => ({
        ...i,
        image_url: i.image_url ?? null,
        image_urls: i.image_urls ?? [], // Возвращаем массив
        price: i.price == null ? null : Number(i.price),
        created_at: i.created_at?.toISOString() ?? null,
      })),
    });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const { title, description, price, location, image_url, image_urls } = body;
  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  // Если image_urls предоставлен, используем его, иначе пытаемся взять из image_url
  const finalImageUrls = Array.isArray(image_urls) ? image_urls.filter(url => typeof url === 'string') : [];
  const firstImageUrlFromLegacy = typeof image_url === "string" && image_url.trim() ? image_url.trim() : null;

  // Если image_urls пуст, но есть старый image_url, добавляем его
  if (finalImageUrls.length === 0 && firstImageUrlFromLegacy) {
    finalImageUrls.push(firstImageUrlFromLegacy);
  }

  const item = await prisma.items.create({
    data: {
      title: title.trim(),
      description: typeof description === "string" ? description.trim() || null : null,
      price: typeof price === "number" ? price : 0,
      location: typeof location === "string" ? location.trim() || null : null,
      image_url: finalImageUrls.length > 0 ? finalImageUrls[0] : null, // Сохраняем первый URL в старое поле для совместимости
      image_urls: finalImageUrls, // Сохраняем массив
      seller_id: session.user.id,
    },
  });
  revalidatePath("/");
  return NextResponse.json({ id: item.id });
}
