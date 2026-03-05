## Проект «Комиссионка»: архитектура

Этот документ даёт обзор архитектуры проекта «Комиссионка» и описывает, как устроены основные подсистемы: веб‑приложение, агент к модели ИИ, Telegram‑бот, база данных и инфраструктура деплоя.

Опорные подробные мануалы:
- Веб‑приложение: `docs/manual/app-komissionka.md`
- Агент: `docs/manual/agent.md`
- Telegram‑бот: `docs/manual/telegram-bot.md`
- Правила версионности: `docs/VERSIONING-RULES.md`
- Журнал изменений: `what's new.md`, `agent/what's new.md`

---

## 1. Основные подсистемы

### 1.1 Веб‑приложение (Next.js, React)

- Стек: Next.js (App Router), React, TypeScript, Prisma, NextAuth, shadcn/UI, Tailwind.
- Корневой код: `src/`.
- Страницы и маршруты:
  - Публичные страницы:
    - Главная: `src/app/page.tsx`
    - Карточка товара: `src/app/items/[id]/page.tsx`
  - Аутентификация и профиль:
    - Логин: `src/app/login/page.tsx`
    - Регистрация (если включена): `src/app/signup/*`
    - Личный кабинет: `src/app/profile/page.tsx`
  - Админка:
    - Панель управления и вкладка «Комиссионка AI»: `src/app/admin/page.tsx`
    - Prisma Studio в браузере: `src/app/admin/prisma-studio/page.tsx`
    - Вспомогательные страницы диагностики: `src/app/diagnose-images/page.tsx`, `src/app/test-db/page.tsx`, `src/app/test/page.tsx`
- Основные API‑маршруты:
  - Аутентификация и профиль:
    - `src/app/api/auth/[...nextauth]/route.ts`
    - `src/app/api/auth/profile/route.ts`
  - Каталог и корзина:
    - Товары: `src/app/api/items/route.ts`, `src/app/api/items/[id]/route.ts`
    - Корзина: `src/app/api/cart/route.ts`
  - Контент и админка:
    - Общие данные панели: `src/app/api/admin/data/route.ts`
    - Новости и отзывы: `src/app/api/admin/news/*`, `src/app/api/admin/testimonials/*`
    - Настройки сайта (`site_settings`): `src/app/api/admin/site-settings/route.ts`
    - Управление профилями и ролями: `src/app/api/admin/profiles/[id]/role/route.ts`
  - Интеграция с агентом:
    - Запуск агента из админки: `src/app/api/admin/agent/run/route.ts`
    - Конфигурация и кэш агента: `src/app/api/admin/agent/config/route.ts`, `src/app/api/admin/agent/cache/route.ts`, `src/app/api/admin/agent/log/route.ts`
  - Telegram‑интеграция:
    - Привязка и режимы: `src/app/api/telegram/*`
  - Служебные:
    - Здоровье: `src/app/api/health/route.ts`
    - Версии: `src/app/api/version/route.ts`
    - Плейсхолдер изображения: `src/app/api/placeholder/route.ts`
    - Диагностика изображений: `src/app/api/diagnose-images/route.ts`

UI админки для работы с агентом (чаты, ход выполнения, выбор модели, загрузка входных изображений) реализован в `src/app/admin/page.tsx` и использует API `/api/admin/agent/*`.

### 1.2 Агент к модели ИИ

- Код агента: каталог `agent/`.
- Режимы работы:
  - CLI: разовый запуск (`agent/run.ts`).
  - HTTP‑сервер: долговременный процесс (`agent/serve.ts`) с основным маршрутом `POST /run` (и опцией `?stream=1` для SSE).
- Ядро:
  - Основной цикл рассуждений: `agent/core.ts` (`runAgentCore()`), который:
    - принимает промпт и историю диалога;
    - вызывает LLM через `agent/llm/index.ts`;
    - обрабатывает tool calls (`read_file`, `write_file`, `grep`, `run_command` и др.) из `agent/tools/*`;
    - накапливает шаги (`steps`) и подробный лог (`logEntries`);
    - формирует ответ с подвалом отчёта (через `agent/lib/report-footer.ts`) и статусом служб.
- Конфигурация:
  - `agent/config.ts` (`getConfig()`):
    - читает переменные `AGENT_*` и `agent/config.json`;
    - определяет корень репозитория (`root`), модель LLM и API‑ключи;
    - задаёт `AGENT_APP_URL` (URL приложения для `curl`‑запросов к `/api/*`).
- Системный промпт и режимы:
  - Определены в `agent/llm/system-prompt.ts`.
  - Режимы:
    - `chat` («курилка») — лёгкий режим без доступа к коду, только чтение контекста и `get_agent_info`/`write_docs_file`.
    - `consult` — консультации с доступом к чтению кода и данных.
    - `dev` — режим разработки с правом изменять репозиторий через инструменты `write_file` и `run_command` (с подтверждением).

### 1.3 Telegram‑бот

- Код: один файл `telegram-bot/bot.ts`.
- Технологии:
  - `node-telegram-bot-api` (long polling).
  - HTTP‑интеграция с приложением (через `APP_BASE_URL`) и с агентом (`AGENT_PORT`, `AGENT_API_KEY`).
- Основные обязанности:
  - Привязка Telegram‑аккаунта администратора по коду (`КОМ-XXXXXX`) через API `src/app/api/telegram/bind/route.ts`.
  - Отправка промптов к агенту с ходом выполнения, аналогичным админке:
    - вызов `/api/agent/selected-model` и `/api/telegram/agent-mode` для выбора модели и режима;
    - стриминговый вызов `http://127.0.0.1:AGENT_PORT/run?stream=1` через `callAgentWithSteps()`.
  - Обработка мультимодального ввода:
    - скачивание фото из Telegram;
    - преобразование в `data:image/jpeg;base64,...`;
    - передача в агент (поле `inputImages`) для анализa изображений.
  - Разбор ответов агента:
    - парсинг markdown‑картинок (`![alt](url)`) и отправка их как `sendPhoto`;
    - поддержка статических путей `/api/uploads/agent/[filename]`.

### 1.4 База данных и Prisma

- Схема: `prisma/schema.prisma`.
- Основные модели:
  - `users` — учётные записи пользователей (email, пароль, флаги SSO).
  - `profiles` — профили (ФИО, роль, Telegram‑идентификаторы, контакты, настройки уведомлений).
  - `items` — товары (продавец, цена, местоположение, URL‑ы изображений, статус).
  - `messages` — сообщения по товарам (чат на карточке).
  - `cart_items` — корзина (уникальная пара `user_id` + `product_id`, отдельный UUID‑ключ `id`).
  - `user_activity` — действия пользователей (страницы, метаданные).
  - `site_settings` — глобальные настройки сайта (hero, баннеры, параметры сетки каталога, параметры карточек, режим/модель агента и др.).
  - `news`, `testimonials` — новости и отзывы.
  - `telegram_bind_code` — коды привязки Telegram.
  - `agent_prompt_cache` — кэш промптов/ответов агента для экономии токенов и аналитики.
- Клиент Prisma:
  - `src/lib/prisma.ts` — подключение к PostgreSQL (пул соединений, адаптер).
- Миграции:
  - `prisma/migrations/*` — история изменений схемы, в том числе:
    - расширение `profiles` контактными полями;
    - добавление параметров отображения каталога;
    - настройка кэша агента и Telegram‑привязки.

### 1.5 Инфраструктура и деплой

- Боевой сервер:
  - VPS Hoster.ru (IP 83.69.248.175), каталог приложения: `~/komissionka`.
  - Домен: `komissionka92.ru` (для ЛК требуется HTTPS).
- Процессы:
  - `komissionka` — Next.js‑приложение (`npm start`), под управлением PM2.
  - `agent` — HTTP‑сервер агента (`npm run agent:serve`).
  - `bot` — Telegram‑бот (`npm run bot`).
- Деплой:
  - Основной путь: git‑деплой через PowerShell‑скрипт `scripts/deploy-hoster-git.ps1`, который:
    - делает `git push origin main`;
    - подключается к серверу и запускает `scripts/deploy-from-git.sh`:
      - `git fetch/reset` в `~/komissionka`;
      - `npm ci` (или `npm install` по fallback);
      - `npx prisma generate && npx prisma migrate deploy`;
      - `npm run build`;
      - `pm2 restart komissionka agent bot`.
  - Резервный путь: `scripts/deploy-hoster.ps1` (scp/rsync) — используется только при проблемах с git‑деплоем.
- Диагностика и мониторинг:
  - Проверка здоровья приложения: `src/app/api/health/route.ts`, `scripts/check-services-status.ts`.
  - Путь к логам агента: каталог `.agent-logs/` в корне (формируется из `agent/core.ts`).

---

## 2. Основные потоки

### 2.1 Запрос обычного пользователя (веб)

1. Браузер открывает страницу (например, `/` или `/items/[id]`).
2. Серверный компонент страницы (`src/app/page.tsx`, `src/app/items/[id]/page.tsx`) вызывает сервисы и/или API:
   - например, `homePageService` для главной страницы (новости, отзывы, товары, настройки сайта);
   - `itemService` для конкретного товара и сообщений.
3. Сервисы работают через Prisma (`src/lib/prisma.ts`) и читают/записывают данные в PostgreSQL по схеме `prisma/schema.prisma`.
4. Статические и загруженные изображения подставляются через `src/lib/image-url.ts` и соответствующие URL `/uploads/*` (см. раздел 2.5).
5. Ответ возвращается как HTML/JSON от Next.js, фронтенд отрисовывает компоненты (`src/components/*`).

### 2.2 Запрос администратора к агенту через админку

1. Админ открывает `/admin` и во вкладке «Комиссионка AI» вводит промпт и, при необходимости, прикрепляет изображения (`src/app/admin/page.tsx`).
2. Фронтенд отправляет `POST` на `src/app/api/admin/agent/run/route.ts` c полями:
   - `prompt`, `history`, `mode` (`chat`/`consult`/`dev`),
   - `stream: true/false`,
   - опционально `inputImages` (data URL‑ы картинок).
3. API‑слой:
   - проверяет права администратора через NextAuth и Prisma;
   - подставляет выбранную в админке модель (`site_settings.agent_llm_model`) и режим;
   - формирует запрос к локальному агенту на `http://127.0.0.1:AGENT_PORT/run`:
     - для обычных запросов может использовать SSE‑стрим (`?stream=1`);
     - для коротких кодовых запросов вида `"1234"`/`"откат 1234"` стрим отключается для надёжности (см. TECH‑NOTES).
   - при сетевых сбоях реализован ретрай и fallback без стрима (см. комментарии в `src/app/api/admin/agent/run/route.ts`).
4. Агент (`agent/serve.ts` + `agent/core.ts`) выполняет основной цикл:
   - строит системный промпт в зависимости от режима;
   - вызывает LLM и инструменты;
   - возвращает результат, шаги (`steps`) и идентификатор лога (при наличии).
5. Админка:
   - по ходу выполнения обновляет блок «Ход выполнения» (steps);
   - отображает финальный ответ с возможными встроенными изображениями;
   - даёт ссылку на последний лог (`.agent-logs/last-reasoning.txt` через API).

### 2.3 Запрос администратора к агенту через Telegram‑бота

1. Администратор привязывает свой Telegram‑аккаунт:
   - в ЛК/админке получает код (`КОМ-XXXXXX`) через API `src/app/api/admin/telegram-bind-code/route.ts`;
   - отправляет код боту, который вызывает `src/app/api/telegram/bind/route.ts` для записи `telegram_id` и `telegram_username` в `profiles`.
2. Далее бот принимает сообщения:
   - текстовые промпты;
   - сообщения с изображением (фото/скан).
3. При каждом запросе бот:
   - проверяет, что отправитель привязан и имеет роль `admin` (через Prisma);
   - через `fetchAgentConfig()` и `fetchBotContext()` получает текущую модель и режим (API `src/app/api/agent/selected-model/route.ts`, `src/app/api/telegram/agent-mode/route.ts`);
   - при наличии фото скачивает его через Telegram API, кодирует в `data:image/jpeg;base64,...` и кладёт в `inputImages`.
4. Бот вызывает локального агента по HTTP (`callAgentWithSteps()` в `telegram-bot/bot.ts`):
   - URL `http://127.0.0.1:AGENT_PORT/run?stream=1`;
   - тело запроса включает `prompt`, `mode`, `project: "Комиссионка"`, `environment: "telegram"`, `inputImages` (если есть).
5. В процессе выполнения бот:
   - получает SSE‑события `step` и обновляет промежуточное сообщение «Ход выполнения»;
   - по завершении получает финальный `result`, разбивает его на сегменты (текст/картинки) и отправляет в чат.

### 2.4 Режим «разработка» и коды подтверждения (общий обзор)

Полные технические детали зафиксированы в `TECH-NOTES.md` (раздел «Механизм кодов подтверждения»). На архитектурном уровне:

1. В режиме `dev` агент анализирует tool calls от модели:
   - если среди них есть `write_file`/`run_command`, агент не выполняет их сразу;
   - вместо этого формируется план изменений: список действий с пояснениями.
2. Агент генерирует 4‑значный код подтверждения и создаёт запись `PendingApproval` в `agent/approval-store.ts`:
   - сохраняются действия, tool calls, список файлов для бэкапа, сообщения контекста и временные метки;
   - состояние пишется в `.agent/pending-codes.json`, чтобы коды переживали перезапуск агента.
3. Пользователь получает в ответ текст с планом и фразой «Подтвердите кодом: XXXX».
4. При последующем вводе:
   - код `"XXXX"` или фраза вида `"код 1234"`, `"подтверждаю 1234"` — трактуются как подтверждение;
   - `"откат 1234"` — как запрос на откат.
5. Подтверждение:
   - агент выполняет скрипт бэкапа `scripts/agent-backup.ts` по списку файлов;
   - затем последовательно выполняет все `run_command`/`write_file` из плана (через `executeTool()` в агенте);
   - результат и идентификатор бэкапа сохраняются как `PendingVerification`;
   - пользователю возвращается новый код для окончательного принятия или отката.
6. TTL кода — 30 минут, причём отсчёт ведётся от момента последнего показа кода (см. поле `lastShownAt` и `refreshPendingShown()`).

### 2.5 Загрузка и отдача изображений

#### 2.5.1 Фото товаров

- Загрузка:
  - API: `src/app/api/upload/item/route.ts`.
  - При включённом `S3_BUCKET` — локальная загрузка отключена и возвращается `501` (заготовка под облачное хранилище).
  - В текущей конфигурации файлы пишутся на локальный диск в `public/uploads/items`:
    - создаётся подкаталог при необходимости;
    - изображения при необходимости даунскейлятся до Full HD (1920×1080) через `sharp`.
- Хранение путей:
  - в БД в `items.image_url` и `items.image_urls` хранятся относительные пути вида `/uploads/items/<filename>`.
- Отдача:
  - API: `src/app/api/uploads/items/[filename]/route.ts`:
    - читает файл из `public/uploads/items`;
    - задаёт корректный `Content-Type` и кэширование;
    - защищает от небезопасных имён файлов.
  - Конфигурация Next.js (rewrites) обеспечивает доступ по URL `/uploads/items/*` даже для файлов, появившихся после сборки `.next`.

#### 2.5.2 Hero‑изображение и картинки агента

- Hero:
  - Загрузка: `src/app/api/upload/hero/route.ts` (admin‑доступ, ресайз и сохранение в `public/uploads/hero`).
  - Отдача: `src/app/api/uploads/hero/[filename]/route.ts`.
- Картинки агента:
  - Физические файлы: каталог `public/uploads/agent` (или путь из переменной `UPLOADS_AGENT_DIR`).
  - Отдача: `src/app/api/uploads/agent/[filename]/route.ts`:
    - использует `UPLOADS_AGENT_DIR` из `.env` на сервере, чтобы не зависеть от структуры деплоя.
  - Telegram‑бот и админка используют эти URL при показе сгенерированных изображений (`/api/uploads/agent/<filename>`).

#### 2.5.3 Плейсхолдеры и диагностика

- Плейсхолдер:
  - Встроенный data‑URI: `src/lib/placeholder.ts` (`PLACEHOLDER_DATA_URI`) — не требует сети.
  - Статический SVG: `public/images/placeholder.svg` (URL `PLACEHOLDER_STATIC_URL`).
  - Генератор по API: `src/app/api/placeholder/route.ts`.
- Диагностика изображений:
  - API `src/app/api/diagnose-images/route.ts` проверяет:
    - наличие ключевых файлов и директорий (`public/images/placeholder.svg`, `public/uploads/items`);
    - примеры записей в `items` и результат `resolveImageUrl`;
    - уникальные префиксы URL в БД и выдаёт рекомендации (например, когда статика `/images/` недоступна в production).

---

## 3. Окружения и версии

### 3.1 Окружения

- **Продакшен (Hoster.ru VPS)** — основная и фактическая среда:
  - Git‑репозиторий в `~/komissionka`;
  - PostgreSQL (managed или локальный);
  - Node.js 20, PM2, Nginx, HTTPS для `komissionka92.ru`.
- **Локальная среда разработчика**:
  - Используется для правок кода и подготовki коммитов;
  - Истинное состояние приложения определяется прод‑репозиторием и БД на сервере;
  - Локальный `npm run dev` может не использоваться, основной цикл разработки завязан на git‑деплой.

### 3.2 Версионирование компонентов

- Файл версий: `version.json`, формат:
  - `app` — версия веб‑приложения;
  - `agent` — версия агента;
  - `tgbot` — версия Telegram‑бота.
- Схема X.Y.Z:
  - X — мажор (>30% строк core);
  - Y — минор (новые фичи, <30% строк core);
  - Z — патч (фикс багов и мелкие улучшения).
- Источники правды по истории изменений:
  - Глобальный лог: `what's new.md` (корень репозитория);
  - Отдельный лог агента: `agent/what's new.md`.
- API версий:
  - `src/app/api/version/route.ts` читает `version.json` и отдаёт актуальные версии компонентов.

Подробные правила и требования к подвалу отчёта (включая обязательный вывод версий до/после и таблицу дат ключевых файлов на сервере) описаны в `docs/VERSIONING-RULES.md` и `.cursor/rules/versioning.mdc`.

