/**
 * Сбор полного кода системы для передачи в системный промпт (режимы consult/dev).
 * Читает все файлы из разрешённых каталогов (src/, prisma/, docs/, agent/, public/) и корневые конфиги.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { ALLOWED_DIR_PREFIXES } from "./path-safe.js";

const MAX_FILE_SIZE = 50_000;
const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".prisma", ".md", ".mts", ".mjs", ".css", ".html", ".env.example"]);

function collectFiles(root: string, maxChars: number): { path: string; content: string }[] {
  const result: { path: string; content: string }[] = [];
  let total = 0;

  function addFile(relPath: string): boolean {
    if (total >= maxChars) return false;
    const absolute = join(root, relPath);
    if (!existsSync(absolute)) return true;
    try {
      const content = readFileSync(absolute, "utf-8");
      if (content.length > MAX_FILE_SIZE) return true; // пропускаем слишком большие
      const block = `\n=== ${relPath} ===\n${content}\n`;
      if (total + block.length > maxChars) return false;
      result.push({ path: relPath, content });
      total += block.length;
      return true;
    } catch {
      return true;
    }
  }

  for (const prefix of ALLOWED_DIR_PREFIXES) {
    const dir = join(root, prefix.replace(/\/$/, ""));
    if (!existsSync(dir)) continue;
    try {
      walk(dir, prefix);
    } catch {
      // ignore
    }
  }

  function walk(dir: string, basePrefix: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const rel = relative(root, join(dir, e.name)).replace(/\\/g, "/");
      if (!rel.startsWith(basePrefix) && !ALLOWED_DIR_PREFIXES.some((p) => rel.startsWith(p))) continue;
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next" || e.name === ".git") continue;
        walk(join(dir, e.name), basePrefix);
      } else if (e.isFile()) {
        const ext = e.name.includes(".") ? "." + e.name.split(".").pop()!.toLowerCase() : "";
        if (!TEXT_EXT.has(ext) && !/\.(env\.example|config\.(js|ts|mjs))$/i.test(e.name)) continue;
        if (!addFile(rel)) return;
      }
    }
  }

  const rootFiles = ["package.json", "tsconfig.json", "next.config.ts", "next.config.js", "next.config.mjs", ".env.example", ".gitignore", "README.md"];
  for (const f of rootFiles) {
    if (total >= maxChars) break;
    addFile(f);
  }

  return result;
}

/**
 * Возвращает блок текста «весь код системы» для вставки в системный промпт.
 * Ограничение по длине — maxChars (по умолчанию 150000).
 */
export function getFullCodeContext(root: string, maxChars: number = 150_000): string {
  const files = collectFiles(root, maxChars);
  if (files.length === 0) return "";
  const body = files.map((f) => `=== ${f.path} ===\n${f.content}`).join("\n\n");
  return `\n\n---\nЭТО ВЕСЬ КОД СИСТЕМЫ (репозиторий «Комиссионка»). ИЗУЧИ его и только потом точечно запрашивай что-либо у агента (read_file/grep — только если нужна актуальная проверка). Не дублируй запросы на уже переданные файлы.\n\n${body}`;
}
