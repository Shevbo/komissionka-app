#!/usr/bin/env npx tsx
/**
 * Проверка товаров в БД: вывод id первых 10, сравнение с getLatestItems.
 * Запуск: npx tsx scripts/check-items-db.ts
 * На сервере: ssh hoster "cd ~/komissionka && npx tsx scripts/check-items-db.ts"
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { getLatestItems } from "../src/services/itemService";

async function main() {
  console.log("=== Проверка товаров в БД ===\n");
  const count = await prisma.items.count();
  console.log(`Всего товаров: ${count}`);

  const latest = await getLatestItems();
  console.log(`getLatestItems() вернул: ${latest.length} товаров`);

  if (latest.length > 0) {
    console.log("\nID товаров с главной (getLatestItems):");
    for (const item of latest) {
      const exists = await prisma.items.findUnique({ where: { id: item.id }, select: { id: true } });
      console.log(`  ${item.id}  ${exists ? "✓" : "✗ НЕ НАЙДЕН"}`);
    }
  }

  const firstFew = await prisma.items.findMany({
    take: 5,
    orderBy: { created_at: "desc" },
    select: { id: true, title: true },
  });
  console.log("\nПоследние 5 в БД (findMany):");
  for (const row of firstFew) {
    console.log(`  ${row.id}  ${row.title?.slice(0, 40)}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
