# Анализ корректности работы сервисов Prisma

## 1. Подключение и конфигурация (`src/lib/prisma.ts`)

**Состояние:** корректно + внесены улучшения.

- Используется **Prisma 7** с драйвер-адаптером `@prisma/adapter-pg` и пулом `pg.Pool` — рекомендуемый способ для PostgreSQL.
- **Singleton в dev:** экземпляр сохраняется в `global` в режиме разработки, чтобы избежать множественных подключений при hot reload.
- **Добавлено:** проверка `DATABASE_URL` при инициализации — приложение падает с понятной ошибкой, а не при первом запросе к БД.

**Рекомендация:** В production (Vercel и др.) не полагаться на `global` — каждый worker может иметь свой экземпляр; пул `pg.Pool` сам ограничивает число соединений.

---

## 2. Сервисы и API-маршруты

### 2.1 Авторизация

| Место | Модель | Оценка |
|-------|--------|--------|
| `lib/auth.ts` | `users.findFirst` по email + bcrypt | ✅ Email нормализуется в lowercase (как при регистрации). |
| `api/auth/signup/route.ts` | `users.create` + `profiles.create` в `$transaction` | ✅ Один id для user и profile, откат при ошибке. |
| `api/auth/profile/route.ts` | `profiles.findUnique` по session user id | ✅ |

### 2.2 Корзина

| Место | Модель | Оценка |
|-------|--------|--------|
| `api/cart/route.ts` GET | `cart_items.findMany` + `include: { items }` | ✅ Цена приводится к number для JSON. |
| `api/cart/route.ts` POST | `cart_items.upsert` по `user_id_product_id` | ✅ Составной уникальный ключ `@@unique([user_id, product_id])` в Prisma задаётся как `user_id_product_id`. |
| `api/cart/[productId]/route.ts` DELETE | `cart_items.deleteMany` | ✅ |

### 2.3 Товары и сообщения

| Место | Модель | Оценка |
|-------|--------|--------|
| `services/itemService.ts` | `items.findMany` + `include: { profiles }` | ✅ |
| `api/items/route.ts` | GET по `ids` / список для админа, POST create | ✅ Decimal (price) в ответах приводится к number. |
| `api/items/[id]/route.ts` | `messages.deleteMany` → `items.delete` | ✅ Порядок удаления корректен (сначала сообщения, потом товар). |
| `api/messages/route.ts` | `messages.findMany`, `messages.create` | ✅ |
| `app/items/[id]/page.tsx` | `items.findUnique` | ✅ |

### 2.4 Админка

| Место | Модель | Оценка |
|-------|--------|--------|
| `api/admin/data/route.ts` | Параллельные запросы (count, findMany для items, messages, profiles, cart_items, user_activity, site_settings, news, testimonials) | ✅ Один вызов — все данные для панели. |
| `api/admin/site-settings/route.ts` | `site_settings.upsert` по `id: "main"` | ✅ Добавлена возможность сброса hero_image_url (null или ""). |
| `api/admin/news/route.ts`, `[id]/route.ts` | create, delete | ✅ |
| `api/admin/testimonials/route.ts`, `[id]/route.ts` | create, update (is_active), delete | ✅ |
| `api/admin/profiles/[id]/role/route.ts` | `profiles.update` role | ✅ Защита от снятия admin с себя. |

### 2.5 Активность и прочее

| Место | Модель | Оценка |
|-------|--------|--------|
| `api/activity/route.ts` | `user_activity.create` | ✅ |
| `api/activity/heartbeat/route.ts` | `profiles.updateMany` по user_id | ✅ updateMany не падает при отсутствии профиля. |
| `services/homePageService.ts` | site_settings, news, testimonials, getLatestItems | ✅ Фильтры `is_published: { not: false }` и `is_active: { not: false }` учитывают null. |

---

## 3. Схема и типы данных

- **Decimal (price, sale_price):** везде при отдаче в API используется `Number(value)` или аналог — для JSON и фронта проблем нет.
- **Даты:** `created_at` и др. отдаются как `.toISOString()` где нужна строка.
- **Составной уникальный ключ** `cart_items(user_id, product_id)` используется в upsert как `user_id_product_id: { user_id, product_id }` — соответствует сгенерированному Prisma имени.

---

## 4. Обработка ошибок

- **signup:** общий try/catch, дубликат email проверяется до транзакции.
- **API-маршруты:** ошибки Prisma (в т.ч. P2002 unique constraint) не обрабатываются отдельно — возвращается 500 с текстом ошибки. Для продакшена можно маппить P2002 в 409 Conflict.

---

## 5. Внесённые исправления

1. **`src/lib/prisma.ts`** — проверка наличия `DATABASE_URL` с выбросом ошибки при старте.
2. **`src/lib/auth.ts`** — приведение email к lowercase при поиске пользователя (консистентно с signup).
3. **`src/app/api/admin/site-settings/route.ts`** — в update добавлена явная поддержка сброса `hero_image_url` (null или пустая строка).

---

## 6. Рекомендации на будущее

1. **Production:** при деплое убедиться, что `DATABASE_URL` задан и пул не исчерпывается (при необходимости ограничить `max` в опциях `pg.Pool`).
2. **Транзакции:** для сложных сценариев (несколько связанных изменений) использовать `prisma.$transaction([...])` для атомарности.
3. **Ошибки:** при необходимости различать в API ошибки Prisma (P2002 → 409, P2025 → 404) и возвращать соответствующие коды и сообщения.
