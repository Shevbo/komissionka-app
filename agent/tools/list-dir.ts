/**
 * list_dir(path) — список файлов и папок в каталоге (без рекурсии).
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveAllowedDir } from "../path-safe.js";
import { getConfig } from "../config.js";

export interface ListDirEntry {
  name: string;
  type: "file" | "directory";
}

export interface ListDirResult {
  ok: true;
  path: string;
  entries: ListDirEntry[];
}

export interface ListDirError {
  ok: false;
  error: string;
  path: string;
}

export type ListDirOutput = ListDirResult | ListDirError;

/**
 * Возвращает список файлов и папок в каталоге. Рекурсия не выполняется.
 */
export function listDir(pathArg: string = "."): ListDirOutput {
  const { root } = getConfig();
  const absolute = resolveAllowedDir(root, pathArg);
  if (!absolute) {
    return { ok: false, path: pathArg, error: "Путь не разрешён или вне репозитория." };
  }
  try {
    const stats = statSync(absolute);
    if (!stats.isDirectory()) {
      return { ok: false, path: pathArg, error: "Указанный путь не является каталогом." };
    }
    const names = readdirSync(absolute);
    const entries: ListDirEntry[] = names.map((name) => {
      try {
        const s = statSync(join(absolute, name));
        return { name, type: s.isDirectory() ? "directory" : "file" };
      } catch {
        return { name, type: "file" as const };
      }
    });
    return { ok: true, path: pathArg, entries };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, path: pathArg, error: `Ошибка: ${message}` };
  }
}