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
  /** 1-based line number of the first returned line (if sliced). */
  startLine?: number;
  /** 1-based line number of the last returned line (if sliced). */
  endLine?: number;
}

export interface ReadFileError {
  ok: false;
  error: string;
  path: string;
}

export type ReadFileOutput = ReadFileResult | ReadFileError;

function sliceByLines(
  content: string,
  offsetLines: number,
  limitLines: number
): { sliced: string; startLine: number; endLine: number } {
  const lines = content.split(/\r?\n/);
  const safeOffset = Math.max(0, offsetLines);
  const safeLimit = Math.max(1, limitLines);
  const startIdx = Math.min(safeOffset, lines.length);
  const endIdx = Math.min(startIdx + safeLimit, lines.length);
  const sliced = lines.slice(startIdx, endIdx).join("\n");
  return { sliced, startLine: startIdx + 1, endLine: endIdx };
}

/**
 * Читает файл по пути относительно корня. Только разрешённые каталоги (src/, prisma/, docs/, agent/, public/) и корневые конфиги.
 */
export function readFile(
  pathArg: string,
  opts?: { offset_lines?: number; limit_lines?: number }
): ReadFileOutput {
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
    const offsetLines = typeof opts?.offset_lines === "number" ? opts.offset_lines : undefined;
    const limitLines = typeof opts?.limit_lines === "number" ? opts.limit_lines : undefined;
    if (offsetLines !== undefined || limitLines !== undefined) {
      const { sliced, startLine, endLine } = sliceByLines(content, offsetLines ?? 0, limitLines ?? 200);
      return { ok: true, path: pathArg, content: sliced, startLine, endLine };
    }
    return { ok: true, path: pathArg, content };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, path: pathArg, error: `Ошибка чтения: ${message}` };
  }
}
