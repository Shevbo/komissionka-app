# Порядок работы с Prisma через командную строку (CLI)

В проекте используется **Prisma 7** с драйвер-адаптером `pg` и движком `engineType = "library"`. Ниже — рекомендуемый порядок команд при работе в терминале (в т.ч. в Cursor).

---

## 1. Первый запуск / после клонирования репозитория

```bash
# 1. Установить зависимости
npm install

# 2. Задать переменные окружения (если ещё не заданы)
# В .env или .env.local:
#   DATABASE_URL="postgresql://user:password@localhost:5432/komissionka"
#   NEXTAUTH_SECRET="..."
#   NEXTAUTH_URL="http://localhost:3000"

# 3. Сгенерировать Prisma Client (обязательно до сборки и запуска)
npx prisma generate

# 4. При необходимости применить миграции к БД
npx prisma migrate deploy
# или для разработки:
npx prisma migrate dev

# 5. (Опционально) заполнить БД начальными данными
npm run seed

# 6. Запустить приложение
npm run dev
```

---

## 2. Ежедневная разработка

Рекомендуемый порядок при открытии проекта и работе в Cursor (или любом терминале):

1. **Проверить/задать `DATABASE_URL`** в `.env` / `.env.local`.
2. **После изменения `prisma/schema.prisma`:**
   ```bash
   npx prisma generate
   ```
   Затем при необходимости:
   ```bash
   npx prisma migrate dev --name описание_изменения
   ```
3. **Запуск приложения:**
   ```bash
   npm run dev
   ```

Итого: **сначала `prisma generate` (и при необходимости миграции), затем `npm run dev`.**

---

## 3. Сборка и продакшен

```bash
# 1. Сгенерировать клиент (часто уже делается в postinstall или в CI)
npx prisma generate

# 2. Собрать приложение
npm run build

# 3. Запуск
npm start
```

В продакшене миграции обычно выполняют отдельно (CI/CD или вручную):

```bash
npx prisma migrate deploy
```

---

## 4. Важные моменты

- **`prisma generate`** нужно запускать после каждого изменения `schema.prisma`, иначе типы и клиент будут устаревшими.
- В проекте используется **библиотечный движок** (`engineType = "library"`) и адаптер `@prisma/adapter-pg`; подключение к БД идёт через `pg.Pool` и `DATABASE_URL`.
- Seed при необходимости запускается так:  
  `npm run seed` или  
  `npx cross-env PRISMA_CLIENT_ENGINE_TYPE=library tsx prisma/seed.ts`.

---

## 5. Про «переключение на Cursor CLI»

**Cursor CLI** (cursor.com/cli) — это инструмент для работы с AI-агентами из терминала; он **не заменяет Prisma** и не является ORM или слоем доступа к БД.

- Если нужно **только уточнить порядок команд** при работе с Prisma в терминале Cursor — используйте разделы 1–4 выше.
- Если планируется **переход с Prisma на другой ORM или инструмент** (Drizzle, Knex и т.п.) — уточните, на что именно переходите, и можно расписать порядок миграции по шагам.

---

## 6. Как посмотреть содержимое всех данных в таблицах БД

### Способ 1: Prisma Studio (удобнее всего)

**Как вызвать**

В терминале из корня проекта:

```bash
npx prisma studio
```

Либо через npm-скрипт (если добавлен):

```bash
npm run prisma:studio
```

**На сервере без GUI (headless):** используйте `--browser none`, иначе Prisma упадёт с ошибкой `xdg-open ENOENT`:

```bash
npx prisma studio --browser none
```

В выводе будет порт (например `http://localhost:51212`). Для доступа с локального компьютера создайте SSH-туннель: `ssh -L 5555:localhost:51212 hoster`, затем откройте http://localhost:5555 в браузере.

**Где открыть в браузере**

- По умолчанию: **http://localhost:5555** (порт может отличаться — смотрите вывод команды)
- Если порт занят или не открывается, укажите другой порт:
  ```bash
  npx prisma studio --port 5556
  ```
  Тогда откройте **http://localhost:5556**

**Где лежит инструкция**

Полное описание работы с Prisma CLI — в этом файле: **`docs/PRISMA-CLI-WORKFLOW.md`** (раздел 6 — просмотр данных, разделы 1–5 — generate, migrate, dev).

В левой панели Studio — список таблиц (users, profiles, items, news, testimonials, site_settings, cart_items, messages, user_activity и др.). Выберите таблицу, чтобы увидеть и при необходимости редактировать строки.

Перед запуском убедитесь, что в `.env` задан `DATABASE_URL`.

---

### Способ 2: Клиент PostgreSQL (psql)

Если установлен PostgreSQL (в т.ч. через установщик или Docker), можно подключиться к БД и выполнить SQL:

```bash
# Подключение (подставьте свои user, host, port, dbname из DATABASE_URL)
psql "postgresql://user:password@localhost:5432/komissionka"
```

Внутри `psql` — просмотр таблиц и данных:

```sql
-- Список таблиц схемы public
\dt public.*

-- Содержимое конкретной таблицы (примеры для таблиц приложения)
SELECT * FROM public.site_settings;
SELECT * FROM public.news;
SELECT * FROM public.testimonials;
SELECT * FROM public.items;
SELECT * FROM public.profiles;
SELECT * FROM public.users LIMIT 10;
SELECT * FROM public.cart_items;
SELECT * FROM public.messages;
SELECT * FROM public.user_activity ORDER BY created_at DESC LIMIT 50;
```

Выход из `psql`: `\q`.

---

### Способ 3: Скрипт в проекте

В репозитории уже есть страница **/test-db**, которая выводит товары из `items`. Для просмотра других таблиц можно добавить аналогичные страницы или разовый скрипт в `scripts/`, который через Prisma Client читает нужные модели и выводит данные в консоль (например, `npx tsx scripts/dump-db.ts`). При необходимости такой скрипт можно описать отдельно.

---

**Итог:** для быстрого просмотра всех таблиц и данных удобнее всего использовать **Prisma Studio** (`npx prisma studio`).
