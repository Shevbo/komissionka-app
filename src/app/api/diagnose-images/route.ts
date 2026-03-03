/**
 * Диагностика отображения фото товаров.
 * GET /api/diagnose-images — вызывает только админ (или без авторизации для быстрой проверки).
 * Возвращает: URL в БД, наличие файлов, результат resolveImageUrl, рекомендации.
 */
import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import path from "node:path";

const APP_BASE = (process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");

function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const s = url.trim();
  if (s.startsWith("/api/") || s.startsWith("/images/")) return s;
  if (s.startsWith("/") && APP_BASE) return `${APP_BASE}${s}`;
  return s;
}

export async function GET() {
  const report: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    cwd: process.cwd(),
    APP_BASE_URL: process.env.APP_BASE_URL ?? "(не задан)",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "(не задан)",
    resolvedBase: APP_BASE || "(пусто — относительные URL)",
    checks: {} as Record<string, unknown>,
  };

  const checks = report.checks as Record<string, unknown>;

  // 1. Файлы на диске
  const publicImagesPlaceholder = path.join(process.cwd(), "public", "images", "placeholder.svg");
  const uploadsItemsDir = path.join(process.cwd(), "public", "uploads", "items");
  checks.files = {
    "public/images/placeholder.svg": existsSync(publicImagesPlaceholder),
    "public/uploads/items": existsSync(uploadsItemsDir),
  };

  // 2. Примеры из БД
  try {
    const { prisma } = await import("komiss/lib/prisma");
    const items = await prisma.items.findMany({
      take: 3,
      orderBy: { created_at: "desc" },
      select: { id: true, title: true, image_url: true, image_urls: true },
    });
    checks.itemsSample = items.map((i) => ({
      id: i.id,
      title: i.title,
      image_url: i.image_url,
      image_urls: i.image_urls,
      resolvedFirst: resolveImageUrl(
        (i.image_urls && i.image_urls.length > 0 ? i.image_urls[0] : i.image_url) ?? null
      ),
    }));

    // 3. Уникальные префиксы URL в БД
    const allItems = await prisma.items.findMany({
      select: { image_url: true, image_urls: true },
    });
    const urlPrefixes = new Set<string>();
    for (const it of allItems) {
      const urls = it.image_urls?.length ? it.image_urls : it.image_url ? [it.image_url] : [];
      for (const u of urls) {
        if (typeof u === "string" && u.trim()) {
          const prefix = u.startsWith("/") ? u.split("/")[1] ?? u : "(absolute)";
          urlPrefixes.add(prefix);
        }
      }
    }
    checks.urlPrefixesInDb = Array.from(urlPrefixes);
  } catch (e) {
    checks.dbError = e instanceof Error ? e.message : String(e);
  }

  // 4. Рекомендации
  const recs: string[] = [];
  const files = checks.files as Record<string, boolean> | undefined;
  if (files && !files["public/images/placeholder.svg"]) {
    recs.push("public/images/placeholder.svg отсутствует — использовать /api/placeholder для плейсхолдеров.");
  }
  const prefixes = checks.urlPrefixesInDb as string[] | undefined;
  if (prefixes?.includes("images") && files && !files["public/images/placeholder.svg"]) {
    recs.push("Товары ссылаются на /images/ — статика недоступна. Заменить на /api/placeholder в скрипте recreate-items и выполнить fix-placeholder-urls.");
  }
  if (!recs.length) recs.push("Все проверки пройдены. Если фото не отображаются — проверить CORS, сеть, консоль браузера.");
  checks.recommendations = recs;

  return NextResponse.json(report);
}
