/**
 * Генерирует плейсхолдер-изображение (SVG). Не зависит от внешних сервисов.
 * GET /api/placeholder?w=400&h=300&n=1
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const w = Math.min(800, Math.max(50, parseInt(searchParams.get("w") ?? "400", 10) || 400));
  const h = Math.min(600, Math.max(50, parseInt(searchParams.get("h") ?? "300", 10) || 300));
  const n = searchParams.get("n") ?? "";
  const text = n ? `Фото ${n}` : "Нет фото";

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#e2e8f0"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="${Math.min(w, h) / 12}">${escapeXml(text)}</text>
</svg>`;

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
