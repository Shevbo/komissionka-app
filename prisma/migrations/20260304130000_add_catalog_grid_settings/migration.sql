ALTER TABLE "site_settings"
  ADD COLUMN IF NOT EXISTS "catalog_min_columns" SMALLINT,
  ADD COLUMN IF NOT EXISTS "catalog_max_card_width" SMALLINT;

