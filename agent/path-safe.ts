/**
 * Безопасная работа с путями: только внутри корня репозитория и разрешённых каталогов/файлов.
 */

import { resolve, normalize, relative } from "node:path";

/** Префиксы каталогов, доступных для чтения (относительно корня). */
export const ALLOWED_DIR_PREFIXES = ["src/", "prisma/", "docs/", "agent/", "public/", "telegram-bot/", "scripts/", ".cursor/"];

/** Файлы в корне, которые разрешено читать и записывать (для версионности). */
const ALLOWED_ROOT_FILES = new Set([
  "package.json",
  "tsconfig.json",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  ".env.example",
  ".gitignore",
  "README.md",
  "version.json",
  "what's new.md",
]);

/**
 * Проверяет, что путь разрешён: под одним из ALLOWED_DIR_PREFIXES или корневой файл из списка.
 */
function isPathAllowed(relativePath: string): boolean {
  const normalized = normalize(relativePath).replace(/\\/g, "/");
  if (normalized.includes("..")) return false;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return false;
  if (parts.length === 1 && ALLOWED_ROOT_FILES.has(parts[0]!)) return true;
  const prefix = parts[0] + "/";
  return ALLOWED_DIR_PREFIXES.some((p) => p === prefix || normalized.startsWith(p));
}

/**
 * Разрешает путь относительно корня и проверяет, что он внутри корня и в allowlist.
 * @returns Абсолютный путь или null, если путь запрещён.
 */
export function resolveAllowedPath(root: string, pathArg: string): string | null {
  const normalizedArg = normalize(pathArg).replace(/\\/g, "/").replace(/^\//, "");
  if (normalizedArg.includes("..")) return null;
  const absolute = resolve(root, normalizedArg);
  const rootResolved = resolve(root);
  if (!absolute.startsWith(rootResolved)) return null;
  const rel = relative(rootResolved, absolute);
  const relNorm = normalize(rel).replace(/\\/g, "/");
  if (relNorm.startsWith("..")) return null;
  if (!isPathAllowed(relNorm)) return null;
  return absolute;
}

/**
 * То же для каталога: разрешён, если сам путь или родители в allowlist (для list_dir и обхода).
 */
export function resolveAllowedDir(root: string, pathArg: string): string | null {
  const normalizedArg = normalize(pathArg || ".").replace(/\\/g, "/").replace(/^\//, "");
  if (normalizedArg.includes("..")) return null;
  const absolute = resolve(root, normalizedArg || ".");
  const rootResolved = resolve(root);
  if (!absolute.startsWith(rootResolved)) return null;
  const rel = relative(rootResolved, absolute);
  const relNorm = normalize(rel).replace(/\\/g, "/") || ".";
  if (relNorm.startsWith("..")) return null;
  // Пустой путь или корень — разрешён; иначе должен быть под разрешённым префиксом
  if (relNorm === "." || relNorm === "") return absolute;
  const prefix = relNorm.split("/")[0] + "/";
  if (!ALLOWED_DIR_PREFIXES.some((p) => p === prefix || relNorm.startsWith(p)))
    return null;
  return absolute;
}

/** Допустимые расширения для read_file (если нужно ограничить только ими). Сейчас не ограничиваем по расширению внутри разрешённых каталогов. */
export const ALLOWED_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".json", ".prisma", ".md", ".mts", ".mjs", ".css", ".html", ".env.example",
]);
