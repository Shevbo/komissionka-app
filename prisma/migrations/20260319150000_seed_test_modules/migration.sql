-- Справочник модулей для каталога тест-кейсов (идемпотентно)
INSERT INTO "test_modules" ("id", "name", "description", "active")
VALUES
  ('app', 'Web-приложение', 'Next.js, API, админка', true),
  ('agent', 'Агент ИИ', 'HTTP/CLI агент к модели', true),
  ('tgbot', 'Telegram-бот', 'Long polling, интеграция с агентом', true),
  ('pwa', 'PWA', 'Мобильная веб-версия', true),
  ('deploy-worker', 'Деплой', 'Очередь и воркер деплоя', true)
ON CONFLICT ("id") DO NOTHING;
