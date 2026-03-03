/**
 * Пересоздаёт карточки товаров, привязывая их к существующему продавцу.
 * Использует первого профиля (или админа bshevelev@mail.ru, если есть).
 * Очищает только items (cart_items, messages удаляются каскадно).
 * Новости и отзывы не трогает.
 * Создаёт реальные SVG-плейсхолдеры в public/uploads/items/ (не /api/placeholder).
 *
 * Запуск: npx tsx scripts/recreate-items.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const ADMIN_EMAIL = "bshevelev@mail.ru";
const UPLOADS_ITEMS = path.join(process.cwd(), "public", "uploads", "items");

function svgPlaceholder(n: number): string {
  const w = 400, h = 400;
  const text = n > 0 ? `Фото ${n}` : "Нет фото";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#e2e8f0"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="${w/12}">${text}</text>
</svg>`;
}

const ITEMS = [
  { title: "iPhone 14 Pro 256GB", price: 89990, location: "Москва", desc: "Смартфон в идеальном состоянии, использовался полгода. Полная комплектация, чеки и гарантия. Батарея держит отлично, царапин нет. Продаю в связи с переходом на другую модель. Торг уместен при самовывозе. Отправка в регионы возможна." },
  { title: "Ноутбук MacBook Air M2", price: 115000, location: "Санкт-Петербург", desc: "MacBook Air на чипе M2, 8 ГБ RAM, 256 ГБ SSD. Работает безупречно, корпус без повреждений. Идеален для работы и учёбы. В комплекте зарядка и оригинальная упаковка. Готов к немедленной передаче покупателю после оплаты." },
  { title: "Sony PlayStation 5", price: 54990, location: "Казань", desc: "Консоль PlayStation 5 в отличном состоянии. В комплекте два джойстика, дисковая версия. Игры в подарок не входят. Подключена к интернету, все обновления установлены. Продаю из-за переезда, торг при личной встрече." },
  { title: "Велосипед горный Trek", price: 45000, location: "Екатеринбург", desc: "Горный велосипед Trek 2022 года. Размер рамы L, амортизаторы в хорошем состоянии. Пробег около 500 км. Подходит для кросс-кантри и лесных троп. Обслуживался в сервисе, документы имеются. Самовывоз." },
  { title: "Диван угловой IKEA", price: 35000, location: "Новосибирск", desc: "Угловой диван IKEA КОРРУППЕЛЬ в сером цвете. Состояние хорошее, обивка без потертостей. Размеры позволяют разместить в гостиной среднего размера. Разборный, удобно перевозить. Продажа в связи с ремонтом." },
  { title: "Холодильник Samsung", price: 42000, location: "Нижний Новгород", desc: "Двухкамерный холодильник Samsung, No Frost. Объём 350 литров, класс энергопотребления A+. Работает тихо, морозилка внизу. Состояние отличное, царапин нет. Самовывоз, помогу с погрузкой. Документы и гарантия прилагаются." },
  { title: "Гитара акустическая Yamaha", price: 18500, location: "Самара", desc: "Акустическая гитара Yamaha F310. Идеально подходит для начинающих и любителей. Звук чистый, корпус без сколов. В комплекте чехол и медиаторы. Струны недавно менял. Продаю, так как перешёл на электрогитару." },
  { title: "Беговая дорожка", price: 28000, location: "Ростов-на-Дону", desc: "Электрическая беговая дорожка для домашних тренировок. Регулировка скорости и угла наклона. Дисплей показывает пульс, калории и дистанцию. Складывается для экономии места. Состояние отличное, использовалась полгода." },
  { title: "Микроволновая печь LG", price: 5500, location: "Краснодар", desc: "Микроволновка LG 23 литра. Гриль и конвекция, сенсорная панель. Работает безупречно, внутри чистая. Размеры стандартные, встраиваемая не является. Готов отдать за символическую цену, торг уместен." },
  { title: "Книжная полка БИЛЛИ", price: 3200, location: "Воронеж", desc: "Книжная полка IKEA БИЛЛИ, белая. Высота 202 см, пять полок. Собрана аккуратно, все крепления на месте. Подходит для книг и декора. Разбирается легко. Самовывоз, помогу вынести. Состояние как новая." },
];

async function main() {
  const adminEmail = ADMIN_EMAIL.trim().toLowerCase();
  const admin = await prisma.users.findFirst({
    where: { email: adminEmail },
    select: { id: true },
  });
  const sellerId = admin?.id;

  let sellerProfile: { id: string; full_name: string | null } | null = null;
  if (sellerId) {
    sellerProfile = await prisma.profiles.findUnique({
      where: { id: sellerId },
      select: { id: true, full_name: true },
    });
  }
  if (!sellerProfile) {
    sellerProfile = await prisma.profiles.findFirst({
      select: { id: true, full_name: true },
    });
  }
  if (!sellerProfile) {
    console.error("Ошибка: нет ни одного профиля в БД. Создайте пользователя.");
    process.exit(1);
  }

  console.log(`Продавец: ${sellerProfile.full_name ?? sellerProfile.id}`);

  console.log("\n1. Очистка items (cart_items, messages — каскадно)...");
  await prisma.messages.deleteMany();
  await prisma.cart_items.deleteMany();
  const delItems = await prisma.items.deleteMany();
  console.log(`   Удалено товаров: ${delItems.count}`);

  await mkdir(UPLOADS_ITEMS, { recursive: true });
  console.log("\n2. Создание 10 товаров с реальными файлами плейсхолдеров...");
  let imgSeed = 100;
  for (const it of ITEMS) {
    const count = 4 + Math.floor(Math.random() * 5);
    const urls: string[] = [];
    for (let i = 0; i < count; i++) {
      imgSeed++;
      const filename = `recreate-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${imgSeed}.svg`;
      const filepath = path.join(UPLOADS_ITEMS, filename);
      await writeFile(filepath, svgPlaceholder(imgSeed), "utf-8");
      urls.push(`/uploads/items/${filename}`);
    }
    await prisma.items.create({
      data: {
        seller_id: sellerProfile!.id,
        title: it.title,
        description: it.desc,
        price: it.price,
        location: it.location,
        image_url: urls[0],
        image_urls: urls,
        status: "available",
      },
    });
  }
  console.log("   Создано 10 товаров с 4–8 фото (файлы в public/uploads/items/)");

  console.log("\n✓ Готово.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
