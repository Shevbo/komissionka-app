/**
 * Заменяет data:image/...;base64,... в тексте на сохранённые файлы.
 * Сохраняет в public/uploads/agent/ — доступно по /uploads/agent/xxx.png.
 * Решает проблему обрезки по maxOutputLength и ограничений браузеров на длинные data-URL.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// Поддержка пробелов/переносов в data URL; base64 санитизируется перед декодированием
const DATA_URL_RE = /!\[([^\]]*)\]\((data:image\/(png|jpeg|jpg|gif|webp)\s*;\s*base64\s*,\s*([^)]+))\)/g;

const EXT_MAP: Record<string, string> = {
  png: "png",
  jpeg: "jpg",
  jpg: "jpg",
  gif: "gif",
  webp: "webp",
};

/**
 * Ищет ![alt](data:image/...;base64,...) в тексте, сохраняет изображения в файлы,
 * заменяет на ![alt](/api/uploads/agent/xxx.ext) — API-маршрут гарантирует раздачу.
 */
export function replaceDataUrlsWithFiles(text: string, rootDir: string): string {
  const outDir = join(rootDir, "public", "uploads", "agent");
  try {
    mkdirSync(outDir, { recursive: true });
  } catch {
    return text;
  }

  return text.replace(DATA_URL_RE, (_full, alt, _dataUrl, format: string, b64Raw: string) => {
    const ext = EXT_MAP[format?.toLowerCase()?.trim()] ?? "png";
    const id = randomUUID();
    const filename = `${id}.${ext}`;
    const filePath = join(outDir, filename);
    try {
      const b64 = b64Raw
        .replace(/\s/g, "")
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .replace(/[^A-Za-z0-9+/=]/g, "");
      if (!b64 || b64.length < 100) return _full;
      const buf = Buffer.from(b64, "base64");
      if (buf.length < 50) return _full;
      writeFileSync(filePath, buf);
      return `![${alt ?? "generated"}](/api/uploads/agent/${filename})`;
    } catch {
      return _full;
    }
  });
}
