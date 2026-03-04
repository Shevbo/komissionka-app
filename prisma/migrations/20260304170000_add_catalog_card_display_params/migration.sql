ALTER TABLE "site_settings"
  ADD COLUMN IF NOT EXISTS "catalog_gap_px" SMALLINT,
  ADD COLUMN IF NOT EXISTS "catalog_card_padding_px" SMALLINT,
  ADD COLUMN IF NOT EXISTS "catalog_title_font_px" SMALLINT,
  ADD COLUMN IF NOT EXISTS "catalog_text_font_px" SMALLINT;
