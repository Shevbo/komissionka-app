/**
 * Загружает .env и .env.local из корня репозитория (родитель каталога agent/),
 * чтобы переменные AGENT_*, DATABASE_URL и др. подхватывались независимо от рабочей директории запуска.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const agentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(agentDir, "..");
config({ path: join(projectRoot, ".env") });
if (existsSync(join(projectRoot, ".env.local"))) {
  config({ path: join(projectRoot, ".env.local"), override: true });
}
