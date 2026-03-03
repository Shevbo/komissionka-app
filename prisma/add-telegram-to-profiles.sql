-- 4.1 + 4.2: привязка администратора к Telegram (TELEGRAM-BOT-SPRINT-DESIGN.md)
-- Добавляем в profiles: telegram_id (уникальный), telegram_username.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_id VARCHAR(64);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(255);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_telegram_id_key') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_telegram_id_key UNIQUE (telegram_id);
  END IF;
END $$;
