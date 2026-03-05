/**
 * Обновляет изображения одного товара, задавая 3 реальных фото через picsum.photos.
 * Использование: npx tsx scripts/migrate-item-to-picsum.ts <itemId> [<titleOverride>]
 *
 * - itemId — обязательный UUID товара.
 * - titleOverride — необязательный текст для seed (если хотим переопределить название).
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const [, , itemId, titleOverride] = process.argv;

  if (!itemId || !itemId.trim()) {
    console.error("Usage: npx tsx scripts/migrate-item-to-picsum.ts <itemId> [<titleOverride>]");
    process.exit(1);
  }

  const id = itemId.trim();

  const existing = await prisma.items.findUnique({
    where: { id },
    select: { id: true, title: true },
  });

  if (!existing) {
    console.error("Item not found by id:", id);
    process.exit(1);
  }

  const baseTitle = (titleOverride ?? existing.title ?? existing.id).toString();
  const base = encodeURIComponent(baseTitle);

  const urls = [
    `https://picsum.photos/seed/${base}-photo/800/600`,
    `https://picsum.photos/seed/${base}-schematic-1/800/600`,
    `https://picsum.photos/seed/${base}-schematic-2/800/600`,
  ];

  await prisma.items.update({
    where: { id },
    data: {
      image_url: urls[0],
      image_urls: urls,
    },
  });

  console.log("Updated item", id, "with urls:", urls);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

