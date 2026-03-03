import Link from "next/link";
import { unstable_noStore } from "next/cache";
import { prisma } from "komiss/lib/prisma";
import { resolveImageUrl } from "komiss/lib/image-url";
import { ItemPageContent } from "./ItemPageContent";

export const dynamic = "force-dynamic";

type Params = { id: string };

export default async function ItemPage({
  params,
}: {
  params: Promise<Params>;
}) {
  unstable_noStore();
  const { id } = await params;
  const idRaw = typeof id === "string" ? id : Array.isArray(id) ? (id[0] ?? "") : String(id ?? "");
  const idClean = (() => {
    try {
      return decodeURIComponent(idRaw).trim();
    } catch {
      return idRaw.trim();
    }
  })();

  if (!idClean) {
    return (
      <div className="min-h-screen bg-background p-8">
        <p className="text-destructive">Неверный идентификатор товара</p>
        <Link href="/" className="text-primary hover:underline">
          ← На главную
        </Link>
      </div>
    );
  }

  const row = await prisma.items.findUnique({
    where: { id: idClean },
    select: {
      id: true,
      seller_id: true,
      title: true,
      description: true,
      price: true,
      location: true,
      image_url: true,
      image_urls: true,
      status: true,
      is_auction: true,
      sale_price: true,
    },
  });

  if (!row) {
    const count = await prisma.items.count();
    console.warn(`[items] Товар не найден: id=${JSON.stringify(idClean)}, raw=${JSON.stringify(idRaw)}, всего в БД: ${count}`);
    return (
      <div className="min-h-screen bg-background p-8">
        <p className="text-destructive">Товар не найден</p>
        <p className="mt-2 text-sm text-muted-foreground">
          ID: {idClean || "(пусто)"} · В каталоге: {count} товаров
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Диагностика: откройте <code className="rounded bg-muted px-1">/api/items/{idClean || "..."}</code> — если там тоже 404, проблема в БД или id.
        </p>
        <Link href="/" className="mt-4 inline-block text-primary hover:underline">
          ← На главную
        </Link>
      </div>
    );
  }

  const rawUrls =
    row.image_urls && row.image_urls.length > 0
      ? row.image_urls
      : row.image_url
        ? [row.image_url]
        : [];
  const image_urls = rawUrls.map((u) => resolveImageUrl(u) ?? u).filter(Boolean) as string[];
  const profile = await prisma.profiles.findUnique({
    where: { id: row.seller_id },
    select: { full_name: true },
  });
  const resolvedImageUrl = resolveImageUrl(row.image_url) ?? row.image_url;
  const item = {
    id: row.id,
    seller_id: row.seller_id,
    title: row.title,
    description: row.description,
    price: Number(row.price),
    location: row.location,
    image_url: resolvedImageUrl,
    image_urls,
    status: row.status,
    is_auction: row.is_auction,
    sale_price: row.sale_price != null ? Number(row.sale_price) : null,
    profiles: profile ? { full_name: profile.full_name } : null,
  };

  return <ItemPageContent item={item} itemId={idClean} />;
}
