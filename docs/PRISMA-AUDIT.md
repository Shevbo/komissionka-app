# Обзор вызовов Prisma (запись/чтение)

Все обращения к БД идут через `src/lib/prisma.ts` — единый экземпляр с `pg.Pool` и `@prisma/adapter-pg`.

## Критические пути (запись данных)

| Компонент | Таблицы | Операции |
|-----------|---------|----------|
| Главная страница | site_settings, news, testimonials, items | findUnique, findMany |
| Карточка товара | items, profiles | findUnique |
| Админ — контент | site_settings | upsert |
| Админ — баннер/hero | site_settings (hero_image_url, news_banner_height) | upsert |
| Админ — новости | news | create, delete |
| Админ — отзывы | testimonials | create, update, delete |
| Товары | items | create, update, delete |
| Сообщения в карточке | messages | create, findMany |
| Чаты агента | agent_prompt_cache | findMany, create (agent) |
| Авторизация | users, profiles | findFirst, create, update |

## Проверка подключения

```bash
npx tsx scripts/db-check.ts
```

Выводит количество записей по таблицам. Если counts = 0 и данные на сайте есть — возможно кэш или другой источник. Если ошибка подключения — проверьте DATABASE_URL.
