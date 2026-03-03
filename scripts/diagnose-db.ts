/**
 * Диагностика: логин, товары, связь items-seller.
 * npx tsx scripts/diagnose-db.ts
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const email = "bshevelev@mail.ru".trim().toLowerCase();

  console.log("=== 1. Проверка пользователя ===");
  const user = await prisma.users.findFirst({
    where: { email, is_sso_user: false },
    select: { id: true, email: true, encrypted_password: true },
  });
  if (!user) {
    console.log("  ОШИБКА: пользователь не найден");
  } else {
    const ok = await bcrypt.compare("123456", user.encrypted_password || "");
    console.log(`  id=${user.id}, hasPassword=${!!user.encrypted_password}, bcryptOk=${ok}`);
  }

  console.log("\n=== 2. Профиль продавца ===");
  if (user) {
    const profile = await prisma.profiles.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, role: true },
    });
    console.log(profile ? `  profile: id=${profile.id}, role=${profile.role}` : "  ОШИБКА: профиль не найден");
  }

  console.log("\n=== 3. Товары и связь с продавцом ===");
  const items = await prisma.items.findMany({
    take: 3,
    orderBy: { created_at: "desc" },
    select: { id: true, title: true, seller_id: true },
  });
  for (const it of items) {
    const found = await prisma.items.findUnique({ where: { id: it.id }, select: { id: true } });
    const sellerExists = await prisma.users.findUnique({ where: { id: it.seller_id }, select: { id: true } });
    const profileExists = await prisma.profiles.findUnique({ where: { id: it.seller_id }, select: { id: true } });
    console.log(`  item id=${it.id}, title=${it.title?.slice(0, 20)}...`);
    console.log(`    findUnique: ${found ? "OK" : "FAIL"}, seller exists: ${!!sellerExists}, profile exists: ${!!profileExists}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
