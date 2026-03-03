-- AlterTable: add telegram columns to profiles (if missing)
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "telegram_id" VARCHAR(64) UNIQUE;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "telegram_username" VARCHAR(255);
