-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "news_banner_height" SMALLINT DEFAULT 200;
ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "news_scroll_speed" SMALLINT DEFAULT 3;
