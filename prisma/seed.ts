process.env.PRISMA_CLIENT_ENGINE_TYPE = "library";

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: ["error"] });

function randomPrice(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const FLORAL_ITEMS = [
  {
    title: "Профессиональный секатор (Япония)",
    description:
      "Японская сталь, идеальный угол реза. Инструмент для мастеров — срезы получаются ровными, стебли не сминаются. Обязателен в наборе серьёзного флориста.",
  },
  {
    title: "Ваза керамическая 'Николь'",
    description:
      "Ручная работа, фактура под состаренные материалы. Прекрасно держит объёмные букеты и смотрится в интерьере салона. Высота 28 см.",
  },
  {
    title: "Набор для стабилизированных цветов",
    description:
      "Всё необходимое для работы со стабилизатом: глицериновый состав, кисти, контейнеры. Розы и гортензии сохранят вид годами при правильной обработке.",
  },
  {
    title: "Флористическая губка (оазис) 40×20 см",
    description:
      "Классический оазис для композиций на столах и в корзинах. Стабильно впитывает воду, держит стебли без дополнительной фиксации.",
  },
  {
    title: "Лента для букетов премиум 2.5 см",
    description:
      "Атласная лента с мягким блеском, не скользит при завязывании. 10 цветов в наборе — под любую палитру букета.",
  },
  {
    title: "Супер букет «Серебряная свадьба»",
    description:
      "Праздничный свадебный букет на 25 лет совместной жизни. Роскошная композиция из свежих цветов в бело-серебристой гамме — розы, гортензии, эвкалипт. Идеальный подарок к юбилею семьи.",
    price: 25000,
    image_url: "/super-bouquet.png",
  },
];

async function main() {
  // Создаём тестового пользователя и профиль
  const userId = crypto.randomUUID();
  await prisma.users.upsert({
    where: { id: userId },
    create: {
      id: userId,
      is_sso_user: false,
    },
    update: {},
  });

  const profile = await prisma.profiles.upsert({
    where: { id: userId },
    create: {
      id: userId,
      full_name: "Борис Продавец",
      role: "user",
      email: `boris-${userId.slice(0, 8)}@example.com`,
    },
    update: { full_name: "Борис Продавец" },
  });

  // Создаём товары
  for (const item of FLORAL_ITEMS) {
    const price = "price" in item && typeof item.price === "number" ? item.price : randomPrice(1500, 8000);
    const image_url = "image_url" in item && typeof item.image_url === "string" ? item.image_url : null;
    await prisma.items.create({
      data: {
        title: item.title,
        description: item.description,
        price,
        status: "active",
        seller_id: profile.id,
        image_url,
        image_urls: image_url ? [image_url] : [],
      },
    });
  }

  // Создаём тестовую новость (если нет)
  const newsCount = await prisma.news.count();
  if (newsCount === 0) {
    await prisma.news.create({
      data: {
        title: "Добро пожаловать на Комиссионку!",
        body: "Здесь вы можете продавать и покупать вещи. Регистрируйтесь и начинайте торговать.",
        is_published: true,
      },
    });
  }

  // Создаём тестовый отзыв (если нет)
  const testimonialsCount = await prisma.testimonials.count();
  if (testimonialsCount === 0) {
    await prisma.testimonials.create({
      data: {
        author_name: "Мария",
        text: "Отличный сервис! Продала несколько вещей за неделю.",
        is_active: true,
        rating: 5,
      },
    });
  }

  console.log("Seed выполнен: профиль, товары, новость, отзыв.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
