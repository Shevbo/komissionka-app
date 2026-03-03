/**
 * Точка входа агента (Вариант 2: процесс).
 * Рабочая директория — корень репозитория.
 *
 * Контракт: stdin — промпт (строка), stdout — финальный ответ (строка).
 * Запуск из корня: echo "промпт" | npm run agent:start
 * Или: npm run agent:start (ввести промпт с stdin и Ctrl+Z/Ctrl+D).
 *
 * Окружение: загружается .env из корня репозитория (родитель agent/); конфиг — AGENT_* и опционально agent/config.json.
 */
import "./load-env.js";
import { runAgent } from "./contract.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}

async function main(): Promise<void> {
  const prompt = await readStdin();
  const { result } = await runAgent(prompt);
  process.stdout.write(result, "utf-8");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
