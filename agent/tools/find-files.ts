/**
 * find_files(pattern) — поиск файлов по маске (например, рекурсия *.ts, prisma/*.prisma).
 */

import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { getConfig } from "../config.js";
import { ALLOWED_DIR_PREFIXES } from "../path-safe.js";

const ALLOWED_PREFIXES = ALLOWED_DIR_PREFIXES.map((p) => p.replace(/\/$/, ""));

function matchSegment(segment: string, name: string): boolean {
  if (segment === "**") return true;
  if (segment === "*") return true;
  const re = new RegExp(
    "^" + segment.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$"
  );
  return re.test(name);
}

function walk(
  root: string,
  dir: string,
  patternParts: string[],
  partIndex: number,
  results: string[],
  maxDepth: number,
  currentDepth: number
): void {
  if (currentDepth > maxDepth) return;
  const relDir = relative(root, dir).replace(/\\/g, "/");
  if (relDir && !ALLOWED_PREFIXES.some((p) => relDir === p || relDir.startsWith(p + "/")))
    return;
  const segment = patternParts[partIndex];
  if (partIndex === patternParts.length - 1) {
    if (segment === "**") {
      const entries = readdirSync(dir);
      for (const name of entries) {
        const full = join(dir, name);
        try {
          if (statSync(full).isDirectory()) {
            walk(root, full, patternParts, partIndex, results, maxDepth, currentDepth + 1);
          } else {
            results.push(relative(root, full).replace(/\\/g, "/"));
          }
        } catch {
          // skip
        }
      }
      return;
    }
    const entries = readdirSync(dir);
    for (const name of entries) {
      if (matchSegment(segment, name)) {
        const full = join(dir, name);
        try {
          if (!statSync(full).isDirectory()) {
            results.push(relative(root, full).replace(/\\/g, "/"));
          }
        } catch {
          // skip
        }
      }
    }
    return;
  }
  if (segment === "**") {
    walk(root, dir, patternParts, partIndex + 1, results, maxDepth, currentDepth);
    const entries = readdirSync(dir);
    for (const name of entries) {
      const full = join(dir, name);
      try {
        if (statSync(full).isDirectory()) {
          walk(root, full, patternParts, partIndex, results, maxDepth, currentDepth + 1);
        }
      } catch {
        // skip
      }
    }
    return;
  }
  const entries = readdirSync(dir);
  for (const name of entries) {
    if (!matchSegment(segment, name)) continue;
    const full = join(dir, name);
    try {
      if (statSync(full).isDirectory()) {
        walk(root, full, patternParts, partIndex + 1, results, maxDepth, currentDepth + 1);
      }
    } catch {
      // skip
    }
  }
}

export interface FindFilesResult {
  ok: true;
  pattern: string;
  files: string[];
}

export interface FindFilesError {
  ok: false;
  error: string;
  pattern: string;
}

export type FindFilesOutput = FindFilesResult | FindFilesError;

const MAX_DEPTH = 10;

/**
 * Ищет файлы по маске относительно корня. Поддерживаются один сегмент (*) и рекурсия (**).
 * Примеры: рекурсия по .ts, prisma/*.prisma, src рекурсия .tsx.
 */
export function findFiles(pattern: string): FindFilesOutput {
  const { root } = getConfig();
  const normalized = pattern.replace(/\\/g, "/").replace(/^\//, "");
  if (normalized.includes("..")) {
    return { ok: false, pattern, error: "В маске запрещён '..'." };
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) {
    return { ok: false, pattern, error: "Некорректная маска." };
  }
  const firstDir = parts[0];
  if (!ALLOWED_PREFIXES.some((p) => p === firstDir || firstDir!.startsWith(p))) {
    return { ok: false, pattern, error: "Поиск разрешён только в каталогах: src, prisma, docs, agent, public, telegram-bot, scripts, .cursor." };
  }
  const results: string[] = [];
  try {
    walk(root, root, parts, 0, results, MAX_DEPTH, 0);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, pattern, error: `Ошибка: ${message}` };
  }
  return { ok: true, pattern, files: results.sort() };
}
