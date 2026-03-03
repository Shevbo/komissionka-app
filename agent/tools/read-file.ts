/**
 * read_file(path) — прочитать содержимое файла по пути относительно корня репозитория.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolveAllowedPath } from "../path-safe.js";
import { getConfig } from "../config.js";

export interface ReadFileResult {
  ok: true;
  content: string;
  path: string;
}

export interface ReadFileError {
  ok: false;
  error: string;
  path: string;
}

export type ReadFileOutput = ReadFileResult | ReadFileError;

/**
 * Читает файл по пути относительно корня. Только разрешённые каталоги (src/, prisma/, docs/, agent/, public/) и корневые конфиги.
 */
export function readFile(pathArg: string): ReadFileOutput {
  const { root } = getConfig();
  const absolute = resolveAllowedPath(root, pathArg);
  if (!absolute) {
    return { ok: false, path: pathArg, error: "Путь не разрешён или вне репозитория." };
  }
  if (!existsSync(absolute)) {
    return { ok: false, path: pathArg, error: "Файл не найден." };
  }
  try {
    const content = readFileSync(absolute, "utf-8");
    return { ok: true, path: pathArg, content };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, path: pathArg, error: `Ошибка чтения: ${message}` };
  }
}
