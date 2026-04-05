# Рабочая документация на приложение «Комиссионка» вер. 1.6.0

## Оглавление

1. [Технологический стек](#1-технологический-стек)
2. [Архитектура](#2-архитектура)
3. [Функциональные блоки](#3-функциональные-блоки)
4. [Модель данных](#4-модель-данных)
5. [Доступ к Prisma и БД](#5-доступ-к-prisma-и-бд)
6. [HTTPS для личного кабинета](#6-https-для-личного-кабинета)
7. [Deploy: от разработки до продакшена](#7-deploy-от-разработки-до-продакшена)

---

## 1. Технологический стек

| Компонент | Технология |
|-----------|------------|
| Framework | Next.js 14 (App Router) |
| Язык | TypeScript / JavaScript |
| ORM | Prisma 7 |
| БД | PostgreSQL |
| Аутентификация | NextAuth.js 4 (Credentials Provider, JWT) |
| UI | React, shadcn/ui-компоненты, Tailwind CSS |
| Деплой | Node.js 20, PM2, Nginx |

---

## 2. Архитектура

Приложение — монолит на Next.js с App Router. Структура:

```
src/
├── app/                    # Страницы и API-маршруты
│   ├── page.tsx            # Главная
│   ├── login/, signup/     # Регистрация/вход
│   ├── items/[id]/         # Карточка товара
│   ├── seller/             # Личный кабинет продавца
│   ├── admin/              # Админ-панель
│   └── api/                # REST API
├── components/             # React-компоненты
├── lib/                    # Утилиты, auth, prisma
├── services/               # Бизнес-логика (homePageService, itemService)
```

**Работа с данными:** только через Prisma. RAW SQL запрещён в основном коде приложения.

---

## 3. Функциональные блоки

### 3.1 Аутентификация

| Элемент | Файл | Описание |
|---------|------|----------|
| NextAuth config | [src/lib/auth.ts](../src/lib/auth.ts) | При заданном `SHECTORY_AUTH_BRIDGE_SECRET` вход **только** через каталог портала (локальный `encrypted_password` не проверяется и при успешном входе с портала сбрасывается). Без секрета — только bcrypt в `users`. |
| Мост портала | [src/lib/shectory-portal-auth.ts](../src/lib/shectory-portal-auth.ts), [src/lib/map-portal-role.ts](../src/lib/map-portal-role.ts) | Тот же секрет, что в `.env` Shectory Portal на VDS |
| API route | [src/app/api/auth/[...nextauth]/route.ts](../src/app/api/auth/[...nextauth]/route.ts) | Обработчик NextAuth |
| Регистрация | [src/app/api/auth/signup/route.ts](../src/app/api/auth/signup/route.ts) | Создание `users` + `profiles` в транзакции |
| API профиля | [src/app/api/auth/profile/route.ts](../src/app/api/auth/profile/route.ts) | `GET` — данные профиля, `PATCH` — обновление контактных данных и email, `DELETE` — полное удаление профиля |
| Страницы входа | [src/app/login/page.tsx](../src/app/login/page.tsx), [src/app/signup/page.tsx](../src/app/signup/page.tsx) | Формы |
| Личный кабинет | [src/app/profile/page.tsx](../src/app/profile/page.tsx) | Личный кабинет пользователя с редактированием профиля и просмотром базовой статистики |

### 3.2 Товары и каталог

| Элемент | Файл | Описание |
|---------|------|----------|
| Сервис главной | [src/services/homePageService.ts](../src/services/homePageService.ts) | site_settings, news, testimonials, последние items |
| Сервис товара | [src/services/itemService.ts](../src/services/itemService.ts) | Поиск товара, сообщения |
| API товаров | [src/app/api/items/route.ts](../src/app/api/items/route.ts), [src/app/api/items/[id]/route.ts](../src/app/api/items/[id]/route.ts) | CRUD, batch |
| Картинки | [src/lib/image-url.ts](../src/lib/image-url.ts) | `resolveImageUrl()` — `/uploads/` → полный URL (APP_BASE_URL) |
| Компоненты | [src/components/catalog-grid.tsx](../src/components/catalog-grid.tsx), [src/components/item-card-animated.tsx](../src/components/item-card-animated.tsx), [src/components/HomeCatalogSection.tsx](../src/components/HomeCatalogSection.tsx) | Сетка, карточки. В `catalog-grid.tsx` используются параметры `catalog_min_columns` (минимальное число колонок на телефонах, 1–4) и `catalog_max_card_width` (максимальная ширина карточки в пикселях), которые задаются через таблицу `site_settings` и редактируются администратором во вкладке «Контент» админ‑панели. Это позволяет управлять плотностью сетки и не допускать чрезмерно крупных карточек на широких экранах без изменения кода. |
| Страница товара | [src/app/items/[id]/page.tsx](../src/app/items/[id]/page.tsx), [src/app/items/[id]/ItemPageContent.tsx](../src/app/items/[id]/ItemPageContent.tsx) | Детали, чат, редактирование карточки продавцом (загрузка собственных фото и кнопка генерации новых иллюстраций через Gemini) |
| Генерация иллюстраций | [src/lib/item-image-generator.ts](../src/lib/item-image-generator.ts), [src/app/api/items/[id]/generate-image/route.ts](../src/app/api/items/[id]/generate-image/route.ts) | Запросы к Gemini API выполняются **строго через прокси** из `.env`: `AGENT_PROXY` (или `AGENT_HTTPS_PROXY`, `AGENT_HTTP_PROXY`), ключ `AGENT_LLM_API_KEY`, модель `ITEM_IMAGE_MODEL` (по умолчанию `gemini-2.0-flash-exp`), таймаут прокси `AGENT_PROXY_CONNECT_TIMEOUT_MS`. Те же переменные использует агент к модели ИИ. |

### 3.3 Корзина

| Элемент | Файл | Описание |
|---------|------|----------|
| API корзины | [src/app/api/cart/route.ts](../src/app/api/cart/route.ts), [src/app/api/cart/[productId]/route.ts](../src/app/api/cart/[productId]/route.ts) | GET, POST, DELETE |
| Модель | `cart_items` (user_id, product_id) — составной PK |

### 3.4 Сообщения

| Элемент | Файл | Описание |
|---------|------|----------|
| API | [src/app/api/messages/route.ts](../src/app/api/messages/route.ts) | GET, POST сообщений по item_id |
| Компонент чата | [src/components/item-chat.tsx](../src/components/item-chat.tsx) | UI чата по товару |

### 3.5 Админка

| Элемент | Файл | Описание |
|---------|------|----------|
| Данные панели | [src/app/api/admin/data/route.ts](../src/app/api/admin/data/route.ts) | Единый GET: counts, items, news, testimonials, site_settings и др. |
| Новости | [src/app/api/admin/news/route.ts](../src/app/api/admin/news/route.ts), `[id]/route.ts` | CRUD |
| Отзывы | [src/app/api/admin/testimonials/route.ts](../src/app/api/admin/testimonials/route.ts), `[id]/route.ts` | CRUD |
| Настройки сайта | [src/app/api/admin/site-settings/route.ts](../src/app/api/admin/site-settings/route.ts) | hero, баннеры, параметры каталога (колонки, ширина карточки, расстояние между карточками, отступ текста в карточке, размеры шрифтов заголовка и текста), agent_llm_model, agent_mode; редактируются во вкладке «Контент» админ‑панели |
| Роли | [src/app/api/admin/profiles/[id]/role/route.ts](../src/app/api/admin/profiles/[id]/role/route.ts) | Обновление role (защита от снятия admin с себя) |
| Привязка Telegram | [src/app/api/admin/telegram-bind-code/route.ts](../src/app/api/admin/telegram-bind-code/route.ts) | Генерация кода привязки |
| Бэклог | [src/app/api/admin/backlog/route.ts](../src/app/api/admin/backlog/route.ts), `[id]/route.ts`, [scripts/backlog-cli.ts](../scripts/backlog-cli.ts), [docs/backlog.md](../docs/backlog.md) | Таблица backlog в БД + дубликат в docs/backlog.md. Через UI админки и CLI `npx tsx scripts/backlog-cli.ts` описываются хотелки, статусы спринта и задач, ссылки на документацию и сценарии тестирования; это основной канал постановки задач для агента и Cursor. |
| Каталог тест-кейсов | [src/app/api/admin/test-cases/route.ts](../src/app/api/admin/test-cases/route.ts), [test-modules/route.ts](../src/app/api/admin/test-modules/route.ts), [test-cases/[id]/run/route.ts](../src/app/api/admin/test-cases/[id]/run/route.ts), `test-cases/runs/*` | Универсальный каталог сценариев тестирования (модели `test_modules`, `test_cases`, `test_runs`); UI во вкладке **«Тесты»** админки ([AdminTestCatalogTab.tsx](../src/components/AdminTestCatalogTab.tsx)). Архитектура: [test-catalog-architecture.md](manual/test-catalog-architecture.md) |

### 3.6 Загрузка файлов

| Элемент | Файл | Описание |
|---------|------|----------|
| Hero | [src/app/api/upload/hero/route.ts](../src/app/api/upload/hero/route.ts) | Загрузка hero-изображения |
| Товар | [src/app/api/upload/item/route.ts](../src/app/api/upload/item/route.ts) | Изображения товара |
| Чат | [src/app/api/upload/chat/route.ts](../src/app/api/upload/chat/route.ts) | Вложения в чате |
| Доступ к agent uploads | [src/app/api/uploads/agent/[filename]/route.ts](../src/app/api/uploads/agent/[filename]/route.ts) | Статика для картинок агента |

### 3.7 Активность пользователей

| Элемент | Файл | Описание |
|---------|------|----------|
| API | [src/app/api/activity/route.ts](../src/app/api/activity/route.ts), [src/app/api/activity/heartbeat/route.ts](../src/app/api/activity/heartbeat/route.ts) | Запись `user_activity`, обновление last_active_at |
| Провайдер | [src/components/ActivityProvider.tsx](../src/components/ActivityProvider.tsx) | Контекст активности |

### 3.8 Интеграция с агентом

| Элемент | Файл | Описание |
|---------|------|----------|
| Конфиг агента | [src/app/api/admin/agent/config/route.ts](../src/app/api/admin/agent/config/route.ts) | Настройки агента |
| Кэш | [src/app/api/admin/agent/cache/route.ts](../src/app/api/admin/agent/cache/route.ts) | Просмотр кэша промптов |
| Запуск | [src/app/api/admin/agent/run/route.ts](../src/app/api/admin/agent/run/route.ts) | Вызов агента из админки (текстовый промпт + опциональные входные изображения через поле `inputImages`) |
| Лог | [src/app/api/admin/agent/log/route.ts](../src/app/api/admin/agent/log/route.ts) | Последний лог рассуждений |
| Модель | [src/app/api/admin/agent/model/route.ts](../src/app/api/admin/agent/model/route.ts) | Выбранная модель |
| Публичный выбор модели | [src/app/api/agent/selected-model/route.ts](../src/app/api/agent/selected-model/route.ts) | Текущая модель (без авторизации) |

### 3.9 Telegram API (привязка, режимы)

| Элемент | Файл | Описание |
|---------|------|----------|
| Привязка | [src/app/api/telegram/bind/route.ts](../src/app/api/telegram/bind/route.ts) | Подтверждение привязки по коду |
| Режим/модель | [src/app/api/telegram/agent-mode/route.ts](../src/app/api/telegram/agent-mode/route.ts), set-mode, set-model, agent-models, agent-log, bot-context | Управление ботом из админки |

### 3.10 Служебные API

| Элемент | Файл | Описание |
|---------|------|----------|
| Placeholder | [src/app/api/placeholder/route.ts](../src/app/api/placeholder/route.ts) | SVG-плейсхолдер для фото товаров (без внешних сервисов) |
| Health | [src/app/api/health/route.ts](../src/app/api/health/route.ts) | Проверка доступности приложения |
| Version | [src/app/api/version/route.ts](../src/app/api/version/route.ts) | Текущие версии компонентов |

### 3.11 Личный кабинет пользователя

| Элемент | Файл | Описание |
|---------|------|----------|
| Страница ЛК | [src/app/profile/page.tsx](../src/app/profile/page.tsx) | Личный кабинет: редактирование ФИО, телефона, email, предпочтительного адреса поиска/ПВЗ, настройка email-уведомлений, просмотр даты регистрации и номера профиля, разделы истории заказов и отзывов (пока в виде заглушек) |
| API профиля | [src/app/api/auth/profile/route.ts](../src/app/api/auth/profile/route.ts) | `GET` — получение профиля по сессии (включая контактные поля и порядковый номер), `PATCH` — обновление профиля и email пользователя, `DELETE` — полное удаление аккаунта и связанных данных |

---

## 4. Модель данных

Основные сущности (Prisma schema: [prisma/schema.prisma](../../prisma/schema.prisma)):

| Модель | Описание |
|--------|----------|
| `users` | Пользователи (email, encrypted_password, is_sso_user) |
| `profiles` | Профили (full_name, avatar_url, role, telegram_id, telegram_username, phone, preferred_location, email_notifications_enabled) |
| `items` | Товары (seller_id, title, price, image_url, image_urls, status, is_auction, sale_price) |
| `messages` | Сообщения по товару (item_id, sender_id, content, attachments) |
| `cart_items` | Корзина (user_id, product_id) — составной PK |
| `user_activity` | Логи активности |
| `site_settings` | Настройки сайта (hero, баннеры, автоскролл новостей; каталог: `catalog_min_columns`, `catalog_max_card_width`, `catalog_gap_px`, `catalog_card_padding_px`, `catalog_title_font_px`, `catalog_text_font_px`; agent_llm_model, agent_mode) |
| `news` | Новости |
| `testimonials` | Отзывы |
| `telegram_bind_code` | Коды привязки Telegram (code, profile_id, expires_at) |
| `agent_prompt_cache` | Кэш промптов агента для экономии токенов |
| `test_modules` | Справочник модулей системы для универсального каталога тест‑кейсов (web‑приложение, агент, Telegram‑бот, PWA и др.) |
| `test_cases` | Каталог тест‑кейсов: сценарии тестирования с параметрами (включая ПАРАМЕТР 1–4 для ИИ‑сценариев), ссылками на страницы/эндпоинты/файлы и ожидаемыми результатами |
| `test_runs` | История прогонов тест‑кейсов: статусы, шаги, артефакты (лог рассуждений, дампы, диагностика) и агрегированная статистика |

Связи: `users` ↔ `profiles` (1:1), `users` → `items` (продавец), `items` → `messages`, `users` → `cart_items`, `users` → `user_activity`.

---

## 5. Доступ к Prisma и БД

### 5.1 Подключение

- Клиент Prisma: [src/lib/prisma.ts](../src/lib/prisma.ts) — singleton, `@prisma/adapter-pg`, `pg.Pool`.
- `DATABASE_URL` задаётся в `.env` на сервере.

### 5.2 Интерактивный доступ к БД (psql)

Подробнее: [docs/DB-MANUAL-INSPECT.md](../DB-MANUAL-INSPECT.md).

```bash
# На сервере
ssh hoster
cd ~/komissionka
# source .env или export DATABASE_URL="postgresql://..."
psql "$DATABASE_URL"
```

Основные команды psql: `\dt` (таблицы), `\d таблица` (структура), `\q` (выход).

### 5.3 Prisma Studio

**С портала Shectory** (рекомендуется для навигации)

На [shectory.ru](https://shectory.ru) откройте карточку проекта **Комиссионка** → **Панель управления** или блок workspace: ссылка **Prisma Studio** ведёт на `https://komissionka92.ru/admin/prisma-studio` (метаданные `registryMetaJson.devtools.prismaStudioUrl`). Доступ по сессии администратора Комиссионки. Кнопка убрана из шапки внутренней админки, чтобы не дублировать вход.

**Прямая ссылка**

Страница: `/admin/prisma-studio`, API: `/api/admin/studio`.

**Prisma Studio через CLI** (альтернатива)

На сервере без графического интерфейса Prisma Studio по умолчанию пытается открыть браузер (`xdg-open`) и падает с ошибкой. Запускайте с `--browser none`.

**Шаг 1. Запуск на сервере**

```bash
ssh hoster
cd ~/komissionka
npx prisma studio --browser none
```

В выводе будет строка вида: `Prisma Studio is running at: http://localhost:51212`  
Порт может быть другим (5555, 51212 и т.д.) — запомните его.

**Шаг 2. SSH-туннель с клиентской машины**

В **новом** клиентском терминале (не на сервере):

```bash
ssh -L 5555:localhost:51212 hoster
```

Подставьте свой порт вместо `51212`. `5555` — порт на вашей машине, можно выбрать любой свободный.

**Шаг 3. Открытие в браузере**

Откройте в браузере: **http://localhost:5555**

Prisma Studio будет доступен в браузере через туннель.

**Шаг 4. Остановка**

В терминале на сервере, где запущен Prisma Studio: `Ctrl+C`.

### 5.4 Миграции

```bash
npx prisma migrate deploy   # production
npx prisma migrate dev      # dev (не используется на сервере)
```

---

## 6. HTTPS для личного кабинета

Для доступа к личному кабинету (ЛК) на сайте komissionka92.ru требуется HTTPS. Без HTTPS NextAuth и cookies могут работать некорректно.

**Ошибка антивируса / браузера: «недопустимое имя сертификата» (Kaspersky и др.)**  
Чаще всего сертификат выпущен только для `komissionka92.ru`, а открывают `https://www.komissionka92.ru`, или наоборот. В сертификате в поле **Subject Alternative Name** должны быть **оба** имени. Перевыпустите:

`sudo certbot certonly --nginx -d komissionka92.ru -d www.komissionka92.ru`  
(или `sudo certbot --nginx -d komissionka92.ru -d www.komissionka92.ru`)

После этого в nginx держите редирект **www → без www** и канонический URL в `.env` **`https://komissionka92.ru`** — шаблон: [scripts/nginx-komissionka92.https.conf](../../scripts/nginx-komissionka92.https.conf).

**Шаги настройки HTTPS (Nginx + Certbot):**

1. Установить certbot: `sudo apt install certbot python3-certbot-nginx`
2. Получить сертификат **на оба хоста**: `sudo certbot --nginx -d komissionka92.ru -d www.komissionka92.ru`
3. Обновить `.env`: `NEXTAUTH_URL=https://komissionka92.ru`, `APP_BASE_URL=https://komissionka92.ru`, **`AUTH_TRUST_HOST=true`** (NextAuth v4 за reverse-proxy читает именно **`AUTH_TRUST_HOST`**, не `NEXTAUTH_TRUST_HOST`).
4. Перезапустить: `pm2 restart komissionka agent bot`

**Вход не работает при HTTPS:** проверьте, что в `.env` нет `NEXTAUTH_URL=http://...` — должен быть **`https://komissionka92.ru`** без завершающего слэша, иначе сессионные cookie и редиректы NextAuth расходятся с реальным протоколом.

Подробности деплоя: [docs/HOSTER-RU-DEPLOY.md](../HOSTER-RU-DEPLOY.md).

---

## 7. Deploy: от разработки до продакшена

### 7.1 Условная схема: от разработки до внедрения в прод (git-деплой)

**Порядок деплоя:** деплой выполняется **через очередь и worker** (PM2: `deploy-worker`). Скрипт ставит задачу в API `/api/deploy/queue`; worker запускает `scripts/env-deploy.sh <среда> <ветка>` (для prod — в `~/komissionka`).

```
[Разработка] → [Коммит] → [git push] → [deploy-hoster-git.ps1] → [POST /api/deploy/queue] → [deploy-worker]
     │              │            │                │                        │                        │
     │              │            │                │                        │                        └─ env-deploy.sh prod main → pm2 restart
     │              │            │                │                        └─ (fetch, reset, npm ci, prisma, build)
     │              │            │                └─ version.json, what's new.md
     └─ src/, prisma/, public/ — изменение кода
```

**Этапы (актуальный поток):**

1. **Разработка** — правки в `src/`, `prisma/`, `public/` в серверном контуре. Источник правды — GitHub.
2. **Версионирование** — обновление `version.json` (app), блок UPDATE в корневом `what's new.md`.
3. **Коммит + push** — `git commit` и `git push origin main` из рабочего репозитория.
4. **Git-деплой** — через `./scripts/deploy-hoster-git.ps1 -Branch main`.  
   Скрипт делает `git push origin main` и **добавляет задачу в очередь** (POST `/api/deploy/queue`). Задачу обрабатывает **deploy-worker**: запускает `scripts/env-deploy.sh prod main` в `~/komissionka` (fetch, reset, npm ci, prisma, build, pm2 restart). Правки на проде появляются после обработки очереди (1–5 мин). Деплой разрешён только через очередь; прямой SSH из скрипта отключён.
5. **Старый скрипт `deploy-hoster.ps1`** — только как резервный вариант (scp/rsync) при проблемах с git-деплоем.

### 7.2 Месторасположение изменённого кода (Dev)

| Компонент | Каталог / файлы |
|-----------|-----------------|
| Приложение (web) | `src/` — компоненты, страницы, API, сервисы |
| Prisma | `prisma/schema.prisma`, `prisma/migrations/` |
| Публичные статические файлы | `public/` |
| Конфигурация | `next.config.ts`, `package.json` |

Корень репозитория: каталог с `package.json` (серверная рабочая копия).

### 7.3 Целевое расположение на сервере (Prod)

| Элемент | Путь на сервере |
|---------|-----------------|
| Репозиторий | `~/komissionka` (например `/home/ubuntu/komissionka`) |
| Сборка | `~/komissionka/.next/` |
| Запуск | PM2: процесс `komissionka` (`npm start`) |

Сервер: VPS 83.69.248.175, домен komissionka92.ru.

### 7.4 Инструкция по инкрементальному и полному развёртыванию

**Скрипт деплоя:** [scripts/deploy-hoster.ps1](../../scripts/deploy-hoster.ps1)

**Полный деплой (сборка + загрузка + перезапуск):**

```powershell
.\scripts\deploy-hoster.ps1 -All
```

**Инкрементальная синхронизация (пропуск неизменённых файлов):**

- При наличии **rsync** (PATH, WSL или Chocolatey): используется rsync — передаются только изменённые файлы.
- При отсутствии rsync: PowerShell сравнивает размеры файлов и загружает только изменённые; при сбое — fallback на полный scp.

Для быстрого деплоя можно установить rsync: `choco install rsync`.

**Пошаговые команды:**

| Режим | Команда |
|-------|---------|
| Только сборка | `.\scripts\deploy-hoster.ps1 -Build` |
| Только загрузка | `.\scripts\deploy-hoster.ps1 -Upload` |
| Только перезапуск | `.\scripts\deploy-hoster.ps1 -Restart` |
| Полный цикл | `.\scripts\deploy-hoster.ps1 -All` |

**Ручной деплой на сервере** (если код уже залит, например через Git):

```bash
ssh hoster "cd ~/komissionka && npm install && npm run build && npx prisma generate && npx prisma migrate deploy && pm2 restart komissionka"
```

**После изменений схемы Prisma** — миграции применяются автоматически в шаге Restart (`npx prisma migrate deploy`).
