#!/usr/bin/env npx tsx
/**
 * Подсчёт строк в core-модулях для отчёта о версионности.
 * Использование: npx tsx scripts/count-core-lines.ts
 */
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

function countLinesInPath(root: string, path: string): number {
  const full = join(root, path);
  if (!existsSync(full)) return 0;
  try {
    const stat = statSync(full);
    if (stat.isFile()) {
      return readFileSync(full, "utf-8").split("\n").length;
    }
    if (stat.isDirectory()) {
      let total = 0;
      for (const name of readdirSync(full)) {
        total += countLinesInPath(root, join(path, name).replace(/\\/g, "/"));
      }
      return total;
    }
  } catch {
    return 0;
  }
  return 0;
}

const root = process.cwd();
const appDirs = ["src/app", "src/lib", "prisma/schema.prisma"];
const agentDirs = ["agent/core.ts", "agent/contract.ts", "agent/serve.ts", "agent/config.ts", "agent/llm", "agent/tools", "agent/cache"];
const tgbotDirs = ["telegram-bot/bot.ts"];

let appLines = 0;
for (const p of appDirs) appLines += countLinesInPath(root, p);
let agentLines = 0;
for (const p of agentDirs) agentLines += countLinesInPath(root, p);
let tgbotLines = 0;
for (const p of tgbotDirs) tgbotLines += countLinesInPath(root, p);

console.log(JSON.stringify({ app: appLines, agent: agentLines, tgbot: tgbotLines }));
