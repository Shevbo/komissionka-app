/**
 * write_file(path, content) — записать или перезаписать файл по пути относительно корня.
 * Те же разрешённые каталоги, что и у read_file (src/, prisma/, docs/, agent/, public/ и корневые конфиги).
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { resolveAllowedPath } from "../path-safe.js";
import { getConfig } from "../config.js";

export interface WriteFileResult {
  ok: true;
  path: string;
  message: string;
}

export interface WriteFileError {
  ok: false;
  path: string;
  error: string;
}

export type WriteFileOutput = WriteFileResult | WriteFileError;

/**
 * Записывает файл по пути относительно корня. Создаёт родительские каталоги при необходимости.
 * Только разрешённые каталоги (те же, что для read_file).
 */
export function writeFile(pathArg: string, content: string): WriteFileOutput {
  const { root } = getConfig();
  const absolute = resolveAllowedPath(root, pathArg);
  if (!absolute) {
    return { ok: false, path: pathArg, error: "Путь не разрешён или вне репозитория." };
  }
  try {
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, "utf-8");
    return { ok: true, path: pathArg, message: "Файл записан." };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, path: pathArg, error: `Ошибка записи: ${message}` };
  }
}
