/**
 * Перенумеровывает все тикеты бэклога: order_num = 1, 2, 3, … по текущему порядку
 * (order_num asc, created_at desc).
 * Запуск на сервере: cd ~/komissionka && npx tsx scripts/backlog-renumber.ts
 */

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { syncBacklogToDoc, type BacklogRow } from "../src/lib/backlog-sync";

async function main() {
  const rows = await prisma.backlog.findMany({
    orderBy: [{ order_num: "asc" }, { created_at: "desc" }],
  });
  for (let i = 0; i < rows.length; i++) {
    const id = rows[i]!.id;
    const num = i + 1;
    await prisma.backlog.update({
      where: { id },
      data: { order_num: num },
    });
    console.log(`${num}. ${rows[i]!.short_description.slice(0, 50)}… (${id})`);
  }
  console.log(`\nОбновлено ${rows.length} тикетов. Синхронизация docs/backlog.md…`);
  const list: BacklogRow[] = (
    await prisma.backlog.findMany({
      orderBy: [{ order_num: "asc" }, { created_at: "desc" }],
    })
  ).map((r) => ({
    id: r.id,
    order_num: r.order_num,
    sprint_number: r.sprint_number,
    sprint_status: r.sprint_status,
    short_description: r.short_description,
    description_prompt: r.description_prompt,
    task_status: r.task_status,
    task_type: r.task_type,
    modules: r.modules,
    components: r.components,
    complexity: r.complexity,
    prompt_model: r.prompt_model,
    prompt_created_at: r.prompt_created_at?.toISOString() ?? null,
    prompt_duration_sec: r.prompt_duration_sec ?? null,
    prompt_log_id: r.prompt_log_id,
    prompt_about: r.prompt_about ?? null,
    doc_link: r.doc_link,
    test_order_or_link: r.test_order_or_link,
    created_at: r.created_at?.toISOString() ?? null,
    status_changed_at: r.status_changed_at?.toISOString() ?? null,
  }));
  syncBacklogToDoc(list, process.cwd());
  console.log("Готово.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
