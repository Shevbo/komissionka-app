/**
 * Заменяет битые URL картинок (placehold.co, picsum, /images/placeholder.svg) на API-плейсхолдер.
 * API гарантированно работает в production; статика public/images/ может быть недоступна.
 * Запуск: npx tsx scripts/fix-placeholder-urls.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const PLACEHOLDER = "/api/placeholder?w=400&h=400";

async function main() {
  const items = await prisma.items.findMany({
    select: { id: true, image_url: true, image_urls: true },
  });

  let updated = 0;
  for (const item of items) {
    const urls =
      item.image_urls && item.image_urls.length > 0
        ? item.image_urls
        : item.image_url
          ? [item.image_url]
          : [];
    const hasBroken = urls.some(
      (u) =>
        !u ||
        u.includes("placehold.co") ||
        (u.includes("placeholder") && !u.startsWith("/api/placeholder"))
    );
    if (!hasBroken && urls.length > 0) continue;

    const newUrls = urls.length > 0 ? [PLACEHOLDER] : [];
    await prisma.items.update({
      where: { id: item.id },
      data: { image_url: newUrls[0] ?? null, image_urls: newUrls },
    });
    updated++;
  }

  console.log(`Обновлено ${updated} товаров. Плейсхолдер: ${PLACEHOLDER}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
