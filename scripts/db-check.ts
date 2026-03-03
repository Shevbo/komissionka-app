/**
 * Проверка подключения к БД через чистый pg.
 *
 * Запуск:
 *   npx tsx scripts/db-check.ts
 *
 * Требования: .env с DATABASE_URL, пакет pg установлен.
 */

import "dotenv/config";
import pg from "pg";

const { Client } = pg;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Ошибка: DATABASE_URL не задан в .env");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });

  try {
    await client.connect();
    const res = await client.query("SELECT NOW()");
    console.log("Подключение успешно. Серверное время:", res.rows[0].now);

    const tables = ["users", "profiles", "items", "news", "testimonials", "site_settings", "messages", "agent_prompt_cache"];
    for (const t of tables) {
      try {
        const r = await client.query(`SELECT COUNT(*)::int as c FROM "${t}"`);
        console.log(`  ${t}: ${r.rows[0].c} записей`);
      } catch {
        console.log(`  ${t}: (таблица не найдена)`);
      }
    }
  } catch (err) {
    console.error("Ошибка подключения к БД:");
    if (err instanceof Error) {
      console.error("  Сообщение:", err.message);
      if (err.cause) console.error("  Причина:", err.cause);
    } else {
      console.error(err);
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
