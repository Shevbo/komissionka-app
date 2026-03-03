import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "komiss/lib/auth";
import { prisma } from "komiss/lib/prisma";

/** Публичный GET: проверка наличия товара, для диагностики "товар не найден" */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idClean = typeof id === "string" ? id.trim() : "";
  if (!idClean) {
    return NextResponse.json({ error: "Invalid id", found: false }, { status: 400 });
  }
  const item = await prisma.items.findUnique({
    where: { id: idClean },
    select: { id: true, title: true, price: true, status: true },
  });
  if (!item) {
    const count = await prisma.items.count();
    return NextResponse.json(
      { error: "Not found", found: false, requestedId: idClean, totalItems: count },
      { status: 404 }
    );
  }
  return NextResponse.json({
    found: true,
    item: { id: item.id, title: item.title, price: item.price != null ? Number(item.price) : null, status: item.status },
  });
}

async function isAuthorized(request: Request, itemId: string): Promise<{
  authorized: boolean;
  status?: number;
  error?: string;
}> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return { authorized: false, status: 401, error: "Unauthorized" };
  }

  const profile = await prisma.profiles.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (profile?.role === "admin") {
    return { authorized: true };
  }

  const item = await prisma.items.findUnique({
    where: { id: itemId },
    select: { seller_id: true },
  });

  if (!item || item.seller_id !== userId) {
    return { authorized: false, status: 403, error: "Forbidden" };
  }

  return { authorized: true };
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { authorized, status, error } = await isAuthorized(_request, id);

  if (!authorized) {
    return NextResponse.json({ error }, { status });
  }

  await prisma.messages.deleteMany({ where: { item_id: id } });
  await prisma.items.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath(`/items/${id}`);
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { authorized, status, error } = await isAuthorized(request, id);

  if (!authorized) {
    return NextResponse.json({ error }, { status });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, description, price, location, image_urls } = body;

  if (title !== undefined && typeof title !== "string") {
    return NextResponse.json({ error: "title must be a string" }, { status: 400 });
  }
  if (description !== undefined && typeof description !== "string" && description !== null) {
    return NextResponse.json({ error: "description must be a string or null" }, { status: 400 });
  }
  if (price !== undefined && (typeof price !== "number" || price < 0)) {
    return NextResponse.json({ error: "price must be a non-negative number" }, { status: 400 });
  }
  if (location !== undefined && typeof location !== "string" && location !== null) {
    return NextResponse.json({ error: "location must be a string or null" }, { status: 400 });
  }
  if (image_urls !== undefined && (!Array.isArray(image_urls) || !image_urls.every(url => typeof url === "string"))) {
    return NextResponse.json({ error: "image_urls must be an array of strings" }, { status: 400 });
  }

  const dataToUpdate: Record<string, any> = {};
  if (title !== undefined) dataToUpdate.title = title.trim();
  if (description !== undefined) dataToUpdate.description = description === "" ? null : description.trim();
  if (price !== undefined) dataToUpdate.price = price;
  if (location !== undefined) dataToUpdate.location = location === "" ? null : location.trim();
  if (image_urls !== undefined) dataToUpdate.image_urls = image_urls;

  if (Object.keys(dataToUpdate).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await prisma.items.update({ where: { id }, data: dataToUpdate });
  revalidatePath("/");
  revalidatePath(`/items/${id}`);
  return NextResponse.json({ ok: true });
}
