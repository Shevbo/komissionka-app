/**
 * Создаёт 3 товара с 3 сгенерированными иллюстрациями каждый.
 * Продавец — админ bshevelev@mail.ru.
 * Запуск: npx tsx scripts/seed-three-items.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { generateItemImagesBatch } from "../src/lib/item-image-generator";

const ADMIN_EMAIL = "bshevelev@mail.ru";

const ITEMS = [
  {
    title: "Беспроводные наушники Sony WH-1000XM5",
    price: 24990,
    location: "Севастополь",
    desc: "Премиум-наушники с шумоподавлением. Состояние отличное, все аксессуары в наличии.",
  },
  {
    title: "Электросамокат Xiaomi Pro 2",
    price: 18900,
    location: "Севастополь",
    desc: "Пробег около 500 км, батарея держит заявленные 45 км. Зарядка и документы есть.",
  },
  {
    title: "Кофемашина DeLonghi Magnifica S",
    price: 32500,
    location: "Севастополь",
    desc: "Автоматическая капучинатор, помол встроенный. Использовалась год, в отличном состоянии.",
  },
];

async function main() {
  const admin = await prisma.users.findFirst({
    where: { email: ADMIN_EMAIL.trim().toLowerCase() },
    select: { id: true },
  });
  if (!admin) {
    console.error("Ошибка: админ bshevelev@mail.ru не найден. Сначала: npx tsx scripts/ensure-admin.ts");
    process.exit(1);
  }

  console.log("Создание 3 товаров с 3 фото каждый (Gemini через прокси)...\n");

  for (const it of ITEMS) {
    let urls: string[];
    try {
      urls = await generateItemImagesBatch({
        title: it.title,
        description: it.desc,
        count: 3,
      });
      console.log(`  [OK] Иллюстрации для «${it.title}» сгенерированы.`);
    } catch (e) {
      console.error(`  [fallback] Не удалось сгенерировать для «${it.title}»:`, e);
      urls = ["/images/placeholder.svg", "/images/placeholder.svg", "/images/placeholder.svg"];
    }

    await prisma.items.create({
      data: {
        seller_id: admin.id,
        title: it.title,
        description: it.desc,
        price: it.price,
        location: it.location,
        image_url: urls[0],
        image_urls: urls,
        status: "available",
      },
    });
    console.log(`  Создан товар: ${it.title}`);
  }

  console.log("\nГотово. 3 товара созданы с 3 фото каждый.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
