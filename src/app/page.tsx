import Link from "next/link";
import { unstable_noStore } from "next/cache";
import { Button } from "komiss/components/ui/button";
import { HomeCatalogSection } from "komiss/components/HomeCatalogSection";
import { NewsBanner } from "komiss/components/NewsBanner";
import {
  heroDerivativePath,
  parseHeroResponsiveStem,
} from "komiss/lib/hero-image";
import { Star } from "lucide-react";

export const dynamic = "force-dynamic";

type CatalogItem = {
  id: string;
  title: string;
  price: number | { toString: () => string };
  sale_price?: unknown;
  image_url?: string | null;
  image_urls?: string[];
  location: string | null;
  status: string;
  is_auction?: boolean | null;
  profiles?: { full_name?: string | null; name?: string | null } | null;
};

type Testimonial = {
  id: string;
  author_name: string | null;
  text: string | null;
  is_active: boolean | null;
  rating: number | null;
};

function StarRating({ rating }: { rating: number }) {
  const value = Math.min(5, Math.max(0, Math.round(rating)));
  return (
    <div className="flex items-center gap-1" aria-label={`Оценка: ${value} из 5`}>
      {[...Array(5)].map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i < value ? "text-yellow-500 fill-yellow-500" : "text-gray-300"
          }`}
        />
      ))}
    </div>
  );
}

async function fetchHomeData() {
  try {
    const { getHomeData } = await import("komiss/services/homePageService");
    return await getHomeData();
  } catch (e) {
    console.error("Ошибка загрузки главной:", e);
    return {
      settings: {
        hero_title: "Комиссионка",
        hero_subtitle: "Продавайте и покупайте вещи легко",
        hero_image_url: null,
        h_banner: 200,
        news_banner_height: 200,
        news_scroll_speed: 3,
      },
      news: [],
      testimonials: [],
      items: [] as CatalogItem[],
    };
  }
}

export default async function Home() {
  unstable_noStore();
  const { settings, news, testimonials, items } = await fetchHomeData();
  const hBanner = settings.h_banner ?? 200;
  const newsBannerHeight = (settings as { news_banner_height?: number }).news_banner_height ?? 200;
  const newsScrollSpeed = (settings as { news_scroll_speed?: number }).news_scroll_speed ?? 3;
  const catalogMinColumns = (settings as { catalog_min_columns?: number }).catalog_min_columns ?? 2;
  const catalogMaxCardWidth = (settings as { catalog_max_card_width?: number }).catalog_max_card_width ?? 360;
  const catalogGapPx = (settings as { catalog_gap_px?: number }).catalog_gap_px ?? 24;
  const catalogCardPaddingPx = (settings as { catalog_card_padding_px?: number }).catalog_card_padding_px ?? 24;
  const catalogTitleFontPx = (settings as { catalog_title_font_px?: number }).catalog_title_font_px ?? 18;
  const catalogTextFontPx = (settings as { catalog_text_font_px?: number }).catalog_text_font_px ?? 14;
  const heroImageUrl =
    settings.hero_image_url?.trim() ? settings.hero_image_url : null;
  const heroResponsive = parseHeroResponsiveStem(heroImageUrl);

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Hero баннер */}
        <section
          className="relative z-10 overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 shadow-xl"
          style={{ height: `${hBanner}px` }}
          aria-label="Главный баннер"
        >
          {heroResponsive ? (
            // eslint-disable-next-line @next/next/no-img-element -- hero fill + srcset (viewport / DPR / connection hints)
            <img
              src={heroDerivativePath(heroResponsive.stem, 1280)}
              srcSet={`${heroDerivativePath(heroResponsive.stem, 768)} 768w, ${heroDerivativePath(heroResponsive.stem, 1280)} 1280w, ${heroDerivativePath(heroResponsive.stem, 1920)} 1920w`}
              sizes="100vw"
              alt=""
              className="absolute inset-0 z-0 h-full w-full rounded-2xl object-cover"
              loading="eager"
              decoding="async"
              fetchPriority="high"
              aria-hidden
            />
          ) : (
            heroImageUrl && (
              <div
                className="absolute inset-0 z-0 w-full rounded-2xl"
                style={{
                  backgroundImage: `url("${heroImageUrl}")`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
                aria-hidden
              />
            )
          )}
          <div
            className="absolute inset-0 z-[1] rounded-2xl bg-black/40"
            aria-hidden
          />
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 px-4 text-center">
            <h1 className="text-xl font-semibold tracking-tight text-white drop-shadow-lg sm:text-2xl">
              {settings.hero_title}
            </h1>
            <p className="text-xs text-white drop-shadow-md sm:text-sm">
              {settings.hero_subtitle}
            </p>
            <Button asChild size="sm" className="mt-2 bg-white text-emerald-700 hover:bg-white/90">
              <Link href="/seller">Выставить вещь</Link>
            </Button>
          </div>
        </section>

        {/* Новости */}
        <h2 className="mb-1.5 mt-10 flex items-center gap-1.5 text-lg font-semibold text-amber-900 sm:text-xl" aria-label="Раздел новостей">
          <span className="text-xl" aria-hidden>🏠</span>
          Новости
        </h2>
        <section
          className="relative mb-8 overflow-hidden rounded-2xl border border-amber-200/60 bg-gradient-to-b from-amber-50/95 to-stone-100/95 shadow-lg"
          aria-label="Баннер новостей"
          style={{ height: `${newsBannerHeight}px` }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-100/30 via-transparent to-transparent" aria-hidden="true" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-300/40 to-transparent" aria-hidden="true" />
          <div className="relative z-10 h-full">
            <NewsBanner
              news={news.map((n) => ({ id: n.id, title: n.title, body: n.body }))}
              heightPx={newsBannerHeight}
              speedPxPerSec={newsScrollSpeed}
            />
          </div>
        </section>

        {/* Каталог товаров */}
        <HomeCatalogSection
          items={items.map((item) => ({
            id: item.id,
            title: item.title,
            price: item.price != null ? Number(item.price) : null,
            sale_price: item.sale_price != null ? Number(item.sale_price) : null,
            location: item.location ?? null,
            image_urls: item.image_urls ?? (item.image_url ? [item.image_url] : []),
            status: item.status,
            is_auction: item.is_auction ?? null,
            author_name: item.profiles?.full_name ?? null,
          }))}
          minColumns={catalogMinColumns}
          maxCardWidth={catalogMaxCardWidth}
          gapPx={catalogGapPx}
          cardPaddingPx={catalogCardPaddingPx}
          titleFontPx={catalogTitleFontPx}
          textFontPx={catalogTextFontPx}
        />

        {/* Отзывы */}
        <section className="mt-16" aria-label="Отзывы">
          <h2 className="mb-6 text-2xl font-semibold text-foreground">Отзывы</h2>
          {testimonials.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((t) => (
                <blockquote
                  key={t.id}
                  className="group relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-gradient-to-b from-zinc-50 to-white p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <span
                    className="absolute right-4 top-4 text-6xl font-serif text-emerald-200/60"
                    aria-hidden
                  >
                    "
                  </span>
                  <p className="relative text-sm leading-relaxed text-foreground">{t.text ?? ""}</p>
                  {t.rating != null && (
                    <div className="mt-2">
                      <StarRating rating={t.rating} />
                    </div>
                  )}
                  <footer className="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-4">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
                      {(t.author_name ?? "?")[0].toUpperCase()}
                    </span>
                    <span className="font-medium text-zinc-600">{t.author_name ?? "Аноним"}</span>
                  </footer>
                </blockquote>
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">Пока нет отзывов.</p>
          )}
        </section>
      </main>
    </div>
  );
}
