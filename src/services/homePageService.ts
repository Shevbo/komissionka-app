import { prisma } from "../lib/prisma";
import { resolveImageUrl } from "../lib/image-url";
import { getLatestItems } from "./itemService";

const defaultSettings = {
  hero_title: "Комиссионка",
  hero_subtitle: "Продавайте и покупайте вещи легко",
  hero_image_url: null as string | null,
  h_banner: 200,
  news_banner_height: 200,
  news_scroll_speed: 3,
};

export async function getHomeData() {
  const [settingsResult, newsResult, testimonialsResult, itemsResult] = await Promise.allSettled([
    prisma.site_settings.findUnique({ where: { id: "main" } }),
    prisma.news.findMany({
      where: { OR: [{ is_published: null }, { is_published: { not: false } }] },
      orderBy: { created_at: "desc" },
    }),
    prisma.testimonials.findMany({
      where: { OR: [{ is_active: null }, { is_active: { not: false } }] },
      orderBy: { created_at: "desc" },
      select: { id: true, author_name: true, text: true, is_active: true, created_at: true, rating: true },
    }),
    getLatestItems(),
  ]);

  if (settingsResult.status === "rejected") {
    console.error("Ошибка загрузки site_settings:", settingsResult.reason);
  }
  if (newsResult.status === "rejected") {
    console.error("Ошибка загрузки news:", newsResult.reason);
  }
  if (testimonialsResult.status === "rejected") {
    console.error("Ошибка загрузки testimonials:", testimonialsResult.reason);
  }
  if (itemsResult.status === "rejected") {
    console.error("Ошибка загрузки items:", itemsResult.reason);
  }

  const settings = settingsResult.status === "fulfilled" ? settingsResult.value : null;
  const news = newsResult.status === "fulfilled" ? newsResult.value : [];
  const testimonials = testimonialsResult.status === "fulfilled" ? testimonialsResult.value : [];
  const items = itemsResult.status === "fulfilled" ? itemsResult.value : [];

  return {
    settings: settings
      ? {
          hero_title: settings.hero_title ?? defaultSettings.hero_title,
          hero_subtitle: settings.hero_subtitle ?? defaultSettings.hero_subtitle,
          hero_image_url: resolveImageUrl(settings.hero_image_url) ?? null,
          h_banner: settings.h_banner ?? defaultSettings.h_banner,
          news_banner_height: settings.news_banner_height ?? defaultSettings.news_banner_height,
          news_scroll_speed: settings.news_scroll_speed ?? defaultSettings.news_scroll_speed,
        }
      : defaultSettings,
    news: news ?? [],
    testimonials: testimonials ?? [],
    items: items.map((item) => {
      const urls =
        item.image_urls && item.image_urls.length > 0
          ? item.image_urls
          : item.image_url
            ? [item.image_url]
            : [];
      return {
        ...item,
        image_urls: urls.map((u) => resolveImageUrl(u) ?? u).filter(Boolean) as string[],
      };
    }),
  };
}
