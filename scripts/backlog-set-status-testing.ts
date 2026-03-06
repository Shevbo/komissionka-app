/**
 * Устанавливает task_status = "тестируется" для указанных записей бэклога.
 * Использование: npx tsx scripts/backlog-set-status-testing.ts <id1> [id2 ...]
 * На сервере: cd ~/komissionka && npx tsx scripts/backlog-set-status-testing.ts <id1> <id2>
 */

import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const STATUS = "тестируется" as const;

async function main() {
  const ids = process.argv.slice(2).filter((id) => id.length > 0);
  if (ids.length === 0) {
    console.error("Usage: npx tsx scripts/backlog-set-status-testing.ts <id1> [id2 ...]");
    process.exit(1);
  }
  for (const id of ids) {
    const updated = await prisma.backlog.updateMany({
      where: { id },
      data: { task_status: STATUS, status_changed_at: new Date() },
    });
    if (updated.count > 0) {
      console.log(`Updated ${id} -> ${STATUS}`);
    } else {
      console.warn(`Not found or no change: ${id}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
