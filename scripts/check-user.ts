/**
 * Проверка пользователя и назначение admin
 * npx tsx scripts/check-user.ts bshevelev@mail.ru
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const email = process.argv[2] ?? "bshevelev@mail.ru";
const search = email.trim().toLowerCase();

async function main() {
  // Ищем в users (точное совпадение)
  const userExact = await prisma.users.findFirst({
    where: { email: search, is_sso_user: false },
    select: { id: true, email: true },
  });
  console.log("User (exact match):", userExact ?? "не найден");

  // Через raw SQL - без учёта регистра
  const users = await prisma.$queryRaw<
    { id: string; email: string | null }[]
  >`SELECT id, email FROM users WHERE LOWER(email) = ${search} AND is_sso_user = false LIMIT 5`;
  console.log("Users (case-insensitive):", users);

  // Профили с этим email
  const profiles = await prisma.$queryRaw<
    { id: string; email: string; role: string }[]
  >`SELECT id, email, role FROM profiles WHERE LOWER(email) = ${search} LIMIT 5`;
  console.log("Profiles:", profiles);

  if (users.length > 0) {
    const u = users[0];
    await prisma.profiles.upsert({
      where: { id: u.id },
      create: {
        id: u.id,
        email: u.email ?? search,
        role: "admin",
      },
      update: { role: "admin" },
    });
    console.log(`Роль admin назначена для ${u.email} (id: ${u.id})`);
  } else if (profiles.length > 0) {
    // Есть профиль, но нет в users — нужно создать user или связать
    console.log("Найден профиль, но пользователь в users отсутствует. Создайте аккаунт через /signup.");
  } else {
    console.log("Пользователь не найден. Зарегистрируйтесь через /signup.");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
