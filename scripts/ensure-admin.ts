/**
 * Создаёт или обновляет админа bshevelev@mail.ru с паролем 123456.
 * Не трогает других пользователей.
 * Запуск: npx tsx scripts/ensure-admin.ts
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { prisma } from "../src/lib/prisma";

const ADMIN_EMAIL = "bshevelev@mail.ru";
const ADMIN_PASSWORD = "123456";

async function main() {
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const existing = await prisma.users.findFirst({
    where: { email, is_sso_user: false },
    select: { id: true },
  });

  if (existing) {
    await prisma.users.update({
      where: { id: existing.id },
      data: { encrypted_password: hashed, email_confirmed_at: new Date() },
    });
    await prisma.profiles.upsert({
      where: { id: existing.id },
      create: {
        id: existing.id,
        user_id: existing.id,
        email,
        full_name: "Борис Шевелев",
        role: "admin",
      },
      update: { role: "admin", full_name: "Борис Шевелев", email },
    });
    console.log(`Админ обновлён: ${email} (id=${existing.id})`);
    return;
  }

  const id = randomUUID();
  await prisma.users.create({
    data: {
      id,
      email,
      encrypted_password: hashed,
      email_confirmed_at: new Date(),
      is_sso_user: false,
    },
  });
  await prisma.profiles.create({
    data: {
      id,
      user_id: id,
      email,
      full_name: "Борис Шевелев",
      role: "admin",
    },
  });
  console.log(`Админ создан: ${email} (id=${id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
