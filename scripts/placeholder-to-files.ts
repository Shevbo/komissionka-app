/**
 * Заменяет URL /api/placeholder в image_urls на реальные файлы в public/uploads/items/.
 * Создаёт SVG-плейсхолдеры на диске и обновляет БД.
 * Запуск: npx tsx scripts/placeholder-to-files.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const UPLOADS_ITEMS = path.join(process.cwd(), "public", "uploads", "items");

function isPlaceholderUrl(url: string): boolean {
  if (!url?.trim()) return false;
  const s = url.trim().toLowerCase();
  // Обрабатываем только явные плейсхолдеры, а не реальные фото (picsum/photos и т.п.).
  return s.includes("/api/placeholder") || s.includes("placeholder.svg") || s.includes("placehold.co");
}

function svgPlaceholder(n: number): string {
  const w = 400;
  const h = 400;
  const text = n > 0 ? `Фото ${n}` : "Нет фото";
  const fontSize = Math.min(w, h) / 12;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#e2e8f0"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="${fontSize}">${text}</text>
</svg>`;
}

async function main() {
  await mkdir(UPLOADS_ITEMS, { recursive: true });

  const items = await prisma.items.findMany({
    select: { id: true, image_url: true, image_urls: true },
  });

  let updated = 0;
  let filesCreated = 0;

  for (const item of items) {
    const urls =
      item.image_urls && item.image_urls.length > 0
        ? item.image_urls
        : item.image_url
          ? [item.image_url]
          : [];

    const hasPlaceholder = urls.some(isPlaceholderUrl);
    if (!hasPlaceholder && urls.length > 0) continue;

    const newUrls: string[] = [];
    let idx = 0;
    for (const u of urls) {
      if (isPlaceholderUrl(u)) {
        const filename = `placeholder-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${idx}.svg`;
        const filepath = path.join(UPLOADS_ITEMS, filename);
        const n = idx + 1;
        await writeFile(filepath, svgPlaceholder(n), "utf-8");
        newUrls.push(`/uploads/items/${filename}`);
        filesCreated++;
        idx++;
      } else {
        newUrls.push(u);
      }
    }

    // Если все были плейсхолдеры и результат пуст — создаём один
    if (newUrls.length === 0) {
      const filename = `placeholder-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.svg`;
      const filepath = path.join(UPLOADS_ITEMS, filename);
      await writeFile(filepath, svgPlaceholder(0), "utf-8");
      newUrls.push(`/uploads/items/${filename}`);
      filesCreated++;
    }

    await prisma.items.update({
      where: { id: item.id },
      data: { image_url: newUrls[0] ?? null, image_urls: newUrls },
    });
    updated++;
  }

  console.log(`Обновлено товаров: ${updated}, создано файлов: ${filesCreated}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
