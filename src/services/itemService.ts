import { prisma } from "../lib/prisma";

const LATEST_ITEMS_LIMIT = 10;

/**
 * Возвращает 10 последних добавленных товаров с данными продавца (profiles).
 * Один запрос с include (items → users → profiles).
 */
export async function getLatestItems() {
  try {
    const rows = await prisma.items.findMany({
      take: LATEST_ITEMS_LIMIT,
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        price: true,
        location: true,
        image_url: true,
        image_urls: true,
        status: true,
        is_auction: true,
        sale_price: true,
        created_at: true,
        seller_id: true,
        users: {
          select: {
            profiles: {
              select: { full_name: true },
            },
          },
        },
      },
    });
    return rows.map(({ users, ...item }) => ({
      ...item,
      profiles: users?.profiles ? { full_name: users.profiles.full_name } : null,
    }));
  } catch (error) {
    const prismaError = error as { code?: string; message?: string; meta?: unknown };
    console.error("ОШИБКА ПРИЗМЫ:", {
      code: prismaError.code ?? "UNKNOWN",
      message: prismaError.message ?? String(error),
      meta: prismaError.meta,
    });
    return [];
  }
}
