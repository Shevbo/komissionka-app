-- Таблица одноразовых кодов привязки Telegram (для админки + бот).

CREATE TABLE IF NOT EXISTS telegram_bind_code (
  code       VARCHAR(32) PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS telegram_bind_code_profile_id_idx ON telegram_bind_code(profile_id);
CREATE INDEX IF NOT EXISTS telegram_bind_code_expires_at_idx ON telegram_bind_code(expires_at);
