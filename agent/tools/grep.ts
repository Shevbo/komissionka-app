/**
 * grep(search_string, path?, options?) — поиск по тексту в файлах с контекстом.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { getConfig } from "../config.js";
import { ALLOWED_DIR_PREFIXES } from "../path-safe.js";
import { findFiles } from "./find-files.js";

const ALLOWED_PREFIXES = ALLOWED_DIR_PREFIXES.map((p) => p.replace(/\/$/, ""));

export interface GrepOptions {
  /** Путь к каталогу или файлу (относительно корня). Если не указан — поиск по всем разрешённым каталогам. */
  path?: string;
  /** Строк контекста до и после совпадения. По умолчанию 2. */
  contextLines?: number;
  /** Интерпретировать search_string как регулярное выражение. По умолчанию false (подстрока). */
  useRegex?: boolean;
  /** Маска файлов, например "*.ts". По умолчанию — все текстовые. */
  filePattern?: string;
}

export interface GrepMatch {
  file: string;
  lineNumber: number;
  line: string;
  contextBefore: string[];
  contextAfter: string[];
}

export interface GrepResult {
  ok: true;
  matches: GrepMatch[];
  totalCount: number;
}

export interface GrepError {
  ok: false;
  error: string;
}

export type GrepOutput = GrepResult | GrepError;

const DEFAULT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".json", ".prisma", ".md", ".mts", ".mjs"];

function getFilesToSearch(root: string, pathArg: string | undefined, filePattern: string | undefined): string[] {
  if (pathArg) {
    const pathNorm = pathArg.replace(/\\/g, "/").replace(/^\//, "");
    if (pathNorm.includes("..")) return [];
    const absolute = join(root, pathNorm);
    try {
      const s = statSync(absolute);
      if (s.isFile()) return [pathNorm];
      if (s.isDirectory()) {
        const prefix = pathNorm.split("/")[0];
        if (!ALLOWED_PREFIXES.some((p) => p === prefix || pathNorm.startsWith(p + "/"))) return [];
        const out = findFiles(pathNorm + "/**/*");
        return out.ok ? out.files : [];
      }
    } catch {
      return [];
    }
    return [];
  }
  const patterns = ALLOWED_PREFIXES.map((p) => `${p}/**/*`);
  const all: string[] = [];
  for (const p of patterns) {
    const out = findFiles(p);
    if (out.ok) all.push(...out.files);
  }
  const filtered = filePattern
    ? all.filter((f) => {
        const re = new RegExp("^" + filePattern.replace(/\*/g, ".*") + "$");
        return re.test(f.split("/").pop() || "");
      })
    : all.filter((f) => DEFAULT_EXTENSIONS.some((ext) => f.endsWith(ext)));
  return [...new Set(filtered)];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function grep(
  searchString: string,
  pathArg?: string,
  options: GrepOptions = {}
): GrepOutput {
  const { root } = getConfig();
  const { contextLines = 2, useRegex = false, filePattern } = options;
  const pathOpt = pathArg ?? options.path;

  const files = getFilesToSearch(root, pathOpt, filePattern);
  if (files.length === 0) {
    return { ok: true, matches: [], totalCount: 0 };
  }

  const pattern = useRegex ? searchString : escapeRegex(searchString);
  let re: RegExp;
  try {
    re = new RegExp(pattern, "gu");
  } catch {
    return { ok: false, error: "Некорректное регулярное выражение." };
  }

  const matches: GrepMatch[] = [];
  for (const relPath of files) {
    const absolute = join(root, relPath);
    let content: string;
    try {
      content = readFileSync(absolute, "utf-8");
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i]!)) continue;
      re.lastIndex = 0;
      const contextBefore = lines.slice(Math.max(0, i - contextLines), i);
      const contextAfter = lines.slice(i + 1, i + 1 + contextLines);
      matches.push({
        file: relPath,
        lineNumber: i + 1,
        line: lines[i]!,
        contextBefore,
        contextAfter,
      });
    }
  }

  return { ok: true, matches, totalCount: matches.length };
}
