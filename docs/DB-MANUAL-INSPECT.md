# Просмотр структуры и содержимого БД вручную

На сервере (VPS) доступ к PostgreSQL — через `psql`.

## 1. Подключение к БД

```bash
# На сервере (ssh hoster), если .env есть в ~/komissionka:
cd ~/komissionka
source .env 2>/dev/null || true
# Или задайте вручную:
# export DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME"

psql "$DATABASE_URL"
```

Либо с явными параметрами (подставьте из DATABASE_URL):
```bash
psql "postgresql://komissionka:ПАРОЛЬ@localhost:5432/komissionka"
```

## 2. Основные команды psql

| Команда | Описание |
|---------|----------|
| `\dt` | Список таблиц |
| `\d таблица` | Структура таблицы (колонки, типы) |
| `\du` | Список пользователей БД |
| `\q` | Выход |

## 3. Просмотр содержимого таблиц

```sql
-- Пользователи и профили
SELECT id, email, role FROM profiles LIMIT 10;

-- Товары
SELECT id, title, price, status FROM items ORDER BY created_at DESC LIMIT 10;

-- Новости
SELECT id, title, left(body, 50) as body_preview FROM news LIMIT 10;

-- Отзывы
SELECT id, author_name, rating FROM testimonials LIMIT 10;

-- Настройки сайта (баннер, высота)
SELECT id, key, hero_title, hero_image_url, h_banner, news_banner_height FROM site_settings;
```

## 4. Проверка связи данных

```sql
-- Товары с продавцом
SELECT i.id, i.title, p.email as seller_email
FROM items i
JOIN profiles p ON p.id = i.seller_id
LIMIT 5;
```

## 5. Экспорт в файл

```bash
# На сервере (вне psql)
pg_dump "$DATABASE_URL" -t items -t news -t testimonials --data-only > backup_data.sql
```

## 6. Запуск скриптов seed/ensure-admin

```bash
cd ~/komissionka
npm run ensure:admin
npm run seed:demo
```
