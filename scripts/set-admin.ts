/**
 * Назначает роль admin пользователю по email.
 * Запуск: npx tsx scripts/set-admin.ts <email>
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const email = process.argv[2] ?? "bshevelev@mail.ru";

async function main() {
  const user = await prisma.users.findFirst({
    where: { email: email.trim().toLowerCase(), is_sso_user: false },
    select: { id: true, email: true },
  });

  if (!user) {
    console.error(`Пользователь с email "${email}" не найден.`);
    process.exit(1);
  }

  await prisma.profiles.update({
    where: { id: user.id },
    data: { role: "admin" },
  });

  console.log(`Роль admin назначена: ${user.email} (id: ${user.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
