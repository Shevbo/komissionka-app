/**
 * Удаление всех карточек товаров и пользователей, кроме bshevelev@mail.ru.
 * Только Prisma, без RAW SQL. Режим разработка / очистка демо-данных.
 * Запуск: npx tsx scripts/cleanup-users-and-items.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const KEEPER_EMAIL = "bshevelev@mail.ru";

async function main() {
  const keeper = await prisma.users.findFirst({
    where: { email: { equals: KEEPER_EMAIL, mode: "insensitive" } },
    select: { id: true },
  });
  if (!keeper) {
    console.error(`Кeeper ${KEEPER_EMAIL} не найден. Удаление отменено.`);
    process.exit(1);
  }
  const keeperId = keeper.id;

  const delCart = await prisma.cart_items.deleteMany({ where: { user_id: { not: keeperId } } });
  const nonKeeperItemIds = await prisma.items.findMany({
    where: { seller_id: { not: keeperId } },
    select: { id: true },
  });
  const ids = nonKeeperItemIds.map((i) => i.id);
  const delMessages = ids.length
    ? await prisma.messages.deleteMany({ where: { item_id: { in: ids } } })
    : { count: 0 };
  const delItems = await prisma.items.deleteMany({ where: { seller_id: { not: keeperId } } });
  const delActivity = await prisma.user_activity.deleteMany({ where: { user_id: { not: keeperId } } });
  const delUsers = await prisma.users.deleteMany({ where: { id: { not: keeperId } } });

  console.log(
    `Удалено: cart_items=${delCart.count}, messages=${delMessages.count}, items=${delItems.count}, user_activity=${delActivity.count}, users=${delUsers.count}. Оставлен: ${KEEPER_EMAIL}`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
