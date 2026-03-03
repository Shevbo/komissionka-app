/**
 * Временный скрипт для проверки пользователей в БД.
 *
 * Запуск:
 *   npx tsx scripts/check-users.ts
 *
 * Требования: .env с DATABASE_URL, prisma generate выполнен.
 */

process.env.PRISMA_CLIENT_ENGINE_TYPE = "library";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("--- users ---");
  const users = await prisma.users.findMany({
    select: { id: true, email: true },
  });
  console.table(users);

  console.log("\n--- profiles ---");
  const profiles = await prisma.profiles.findMany({
    select: { id: true, full_name: true, email: true },
  });
  console.table(profiles);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
