-- Ensure site_settings has default row for main page
INSERT INTO "site_settings" ("id", "key", "hero_title", "hero_subtitle", "h_banner", "news_banner_height", "news_scroll_speed")
VALUES ('main', 'main', 'Комиссионка', 'Продавайте и покупайте вещи легко', 200, 200, 3)
ON CONFLICT ("id") DO NOTHING;

-- Add image_urls to items if missing (for Prisma schema compatibility)
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "image_urls" TEXT[] DEFAULT '{}';
