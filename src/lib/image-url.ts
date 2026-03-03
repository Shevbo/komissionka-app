/**
 * Преобразует относительные URL картинок в абсолютные.
 * /api/ и /images/ оставляем относительными — браузер подставит протокол страницы,
 * что избегает mixed content (http-картинки на https-странице).
 */
const APP_BASE = (process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");

export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const s = url.trim();
  if (s.startsWith("/api/") || s.startsWith("/images/")) return s;
  if (s.startsWith("/") && APP_BASE) return `${APP_BASE}${s}`;
  return s;
}
