-- Добавить только колонки баннера новостей в site_settings (без изменения остальных таблиц).
-- Выполнить вручную: psql или через клиент БД.

ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS news_banner_height SMALLINT;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS news_scroll_speed SMALLINT;
