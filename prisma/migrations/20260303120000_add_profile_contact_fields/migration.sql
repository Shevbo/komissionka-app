-- Добавление контактных полей и настроек уведомлений в profiles
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "phone" VARCHAR(32);
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "preferred_location" VARCHAR(255);
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "email_notifications_enabled" BOOLEAN NOT NULL DEFAULT TRUE;

