# Запуск агента (Этап 4)

Выбран **Вариант A — долгоживущий процесс**: агент поднимается как HTTP-сервер и обрабатывает запросы по мере поступления. Дополнительно доступен режим «процесс на запрос» (stdin/stdout) для скриптов.

---

## Режимы запуска

| Режим | Команда | Использование |
|--------|---------|----------------|
| **HTTP-сервер (Вариант A)** | `npm run agent:serve` | Бот или другой сервис шлёт POST /run; один процесс обслуживает много запросов. |
| **Процесс на запрос** | `echo "промпт" \| npm run agent:start` | Разовый запуск: промпт в stdin, ответ в stdout. |

---

## Локальный запуск (HTTP, Вариант A)

1. Из **корня проекта** (рабочая директория = корень репозитория):

   ```bash
   npm run agent:serve
   ```

2. По умолчанию сервер слушает порт **3140**. Задать свой порт: в `.env` указать `AGENT_PORT=3141`.

3. Проверка через curl:

   ```bash
   curl -X POST http://localhost:3140/run -H "Content-Type: application/json" -d "{\"prompt\": \"Что за проект?\"}"
   ```

   Ожидаемый ответ: `{"result":"..."}`.

4. Проверка здоровья (опционально):

   ```bash
   curl http://localhost:3140/health
   ```

   Ответ: `{"status":"ok"}`.

### Защита API (опционально)

Если задана переменная **`AGENT_API_KEY`**, сервер принимает запросы только с корректным ключом:

- Заголовок: `Authorization: Bearer <ваш_ключ>`
- Или: `X-API-Key: <ваш_ключ>`

Пример:

```bash
curl -X POST http://localhost:3140/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ваш_секретный_ключ" \
  -d "{\"prompt\": \"Опиши структуру src/\"}"
```

Без ключа при заданном `AGENT_API_KEY` ответ будет `401 Unauthorized`. Не выставляйте порт агента в публичный интернет без ключа или иной защиты.

---

## Запуск на сервере

Те же переменные окружения (в т.ч. `AGENT_*` из этапов 1–3). Запуск из **корня репозитория**, чтобы `AGENT_ROOT` по умолчанию был корнем проекта.

### PM2

1. Установка PM2 (если ещё нет): `npm i -g pm2`.

2. Запуск агента (из корня репозитория):

   ```bash
   AGENT_API_KEY=ваш_секрет AGENT_LLM_MODEL=... AGENT_LLM_API_KEY=... pm2 start "npm run agent:serve" --name agent
   ```

   Или через ecosystem-файл `ecosystem.config.cjs`:

   ```javascript
   module.exports = {
     apps: [
       {
         name: "agent",
         cwd: "/path/to/komissionka",
         script: "npm",
         args: "run agent:serve",
         env: {
           AGENT_PORT: 3140,
           AGENT_API_KEY: "ваш_секрет",
           AGENT_LLM_MODEL: "anthropic/claude-sonnet-4.6",
           AGENT_LLM_BASE_URL: "https://openrouter.ai/api/v1",
           AGENT_LLM_API_KEY: "sk-or-v1-...",
         },
         // при необходимости загрузить .env из корня:
         // env_file: "/path/to/komissionka/.env",
       },
     ],
   };
   ```

   Запуск: `pm2 start ecosystem.config.cjs`.

3. Просмотр логов: `pm2 logs agent`. Рестарт: `pm2 restart agent`.

### systemd

Файл юнита `/etc/systemd/system/komissionka-agent.service` (подставьте свой путь и пользователя):

```ini
[Unit]
Description=Komissionka Agent (HTTP)
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/path/to/komissionka
EnvironmentFile=/path/to/komissionka/.env
ExecStart=/usr/bin/npm run agent:serve
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Включение и запуск:

```bash
sudo systemctl daemon-reload
sudo systemctl enable komissionka-agent
sudo systemctl start komissionka-agent
sudo systemctl status komissionka-agent
```

Логи: `journalctl -u komissionka-agent -f`.

---

## Устранение неполадок: «Сервис агента недоступен», socket hang up

1. **Агент не запущен.** В отдельном терминале из корня проекта выполните: `npm run agent:serve`. В логе должно появиться: `[agent] HTTP server listening on port 3140`.

2. **Проверка доступности.** В браузере откройте http://127.0.0.1:3140/health — должен вернуться `{"status":"ok"}`. Если страница не открывается, агент не слушает порт или порт занят.

3. **Порт занят или недоступен.** Задайте другой порт в `.env`: `AGENT_PORT=3141`. Перезапустите агента и укажите в админке или в запросах новый порт (если админка берёт порт из переменной окружения Next.js — задайте `AGENT_PORT=3141` и в `.env` приложения).

4. **Ошибка «socket hang up».** Часто значит, что процесс агента упал во время обработки запроса (ошибка Gemini, таймаут, нехватка памяти). Смотрите **терминал, где запущен агент** — там будет сообщение об ошибке (uncaughtException, unhandledRejection или лог из runAgent). Проверьте `AGENT_LLM_API_KEY`, квоты и лимиты API, при необходимости увеличьте `AGENT_TIMEOUT_MS` в `.env`.

5. **Gemini API 429 («You exceed…»).** Превышен лимит запросов или квота. Агент автоматически повторяет запрос до 5 раз с паузой; во время повторов соединение может оборваться (socket hang up), если клиент не получает данных долго. В стриме добавлен heartbeat каждые 15 с. Рекомендации: не отправляйте много запросов подряд; при необходимости смените ключ или увеличьте квоту в [Google AI Studio](https://aistudio.google.com/apikey).

---

## Переменные окружения (напоминание)

Для HTTP-режима дополнительно имеют смысл:

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `AGENT_PORT` | Порт HTTP-сервера | `3140` |
| `AGENT_API_KEY` | Секрет для вызова API (Bearer или X-API-Key). Если не задан — проверка не выполняется. | — |

Остальные `AGENT_*` — как в контракте агента (модель, таймаут, контекст и т.д.). Передавать через `.env` в корне или через окружение процесса (PM2, systemd, Docker).
