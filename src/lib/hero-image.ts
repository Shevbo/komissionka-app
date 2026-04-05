/** WebP derivatives for hero banner (browser picks via <picture> / media). */
export const HERO_DERIVATIVE_WIDTHS = [1920, 1280, 768] as const;
export type HeroDerivativeWidth = (typeof HERO_DERIVATIVE_WIDTHS)[number];

/** Default URL stored in site settings (balance quality vs weight). */
export const HERO_DEFAULT_DERIVATIVE_WIDTH: HeroDerivativeWidth = 1280;

const RESPONSIVE_WEBP = /^(.+)__w(768|1280|1920)\.webp$/i;

export function parseHeroResponsiveStem(
  heroUrl: string | null | undefined
): { stem: string } | null {
  if (!heroUrl?.trim()) return null;
  const u = heroUrl.trim();
  const m = u.match(RESPONSIVE_WEBP);
  if (!m) return null;
  return { stem: m[1] };
}

export function heroDerivativePath(stem: string, w: HeroDerivativeWidth): string {
  return `${stem}__w${w}.webp`;
}
