/**
 * Создание 5 пользователей (пароль 123456), у каждого по 3 товара с 3 фото по контексту названия.
 * Запуск: npx tsx scripts/seed-five-users.ts
 * Идемпотентно: существующие по email пользователи пропускаются.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import bcrypt from "bcryptjs";

async function main() {
  console.log("Start seeding 5 users...");

  const hashedPassword = await bcrypt.hash("123456", 10);

  const usersData = [
    {
      email: "tech_fan@seed.com",
      name: "Alex Tech",
      items: ["MacBook Pro 16", "iPhone 14 Pro", "Sony Headphones"],
    },
    {
      email: "home_decor@seed.com",
      name: "Maria Home",
      items: ["IKEA Sofa", "Wooden Coffee Table", "Floor Lamp"],
    },
    {
      email: "sport_life@seed.com",
      name: "Dmitry Sport",
      items: ["Mountain Bike GT", "Dumbbells Set", "Yoga Mat"],
    },
    {
      email: "fashion_style@seed.com",
      name: "Elena Style",
      items: ["Leather Jacket", "Vintage Jeans", "Ray-Ban Sunglasses"],
    },
    {
      email: "musician_pro@seed.com",
      name: "Ivan Music",
      items: ["Fender Stratocaster", "Yamaha Synthesizer", "Acoustic Drum Kit"],
    },
  ];

  for (const u of usersData) {
    const existing = await prisma.users.findUnique({ where: { email: u.email } });
    if (existing) {
      console.log(`User ${u.email} already exists. Skipping.`);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const user = await tx.users.create({
        data: {
          email: u.email,
          encrypted_password: hashedPassword,
          is_sso_user: false,
          email_confirmed_at: new Date(),
        },
      });

      await tx.profiles.create({
        data: {
          id: user.id,
          user_id: user.id,
          email: u.email,
          full_name: u.name,
          role: "user",
          created_at: new Date(),
          avatar_url: `https://placehold.co/150?text=${encodeURIComponent(u.name[0] ?? "?")}`,
        },
      });

      for (const itemName of u.items) {
        const imageUrls = [
          `https://placehold.co/600x400?text=${encodeURIComponent(itemName + " 1")}`,
          `https://placehold.co/600x400?text=${encodeURIComponent(itemName + " 2")}`,
          `https://placehold.co/600x400?text=${encodeURIComponent(itemName + " 3")}`,
        ];

        await tx.items.create({
          data: {
            seller_id: user.id,
            title: itemName,
            description: `Продаю ${itemName} в отличном состоянии. Использовался бережно. Возможен торг.`,
            price: Math.floor(Math.random() * 40000) + 1500,
            location: "Севастополь, Центр",
            image_url: imageUrls[0],
            image_urls: imageUrls,
            status: "available",
            created_at: new Date(),
          },
        });
      }
    });

    console.log(`Created user: ${u.email} with 3 items.`);
  }

  console.log("Seeding completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
