# Подключение Claude Sonnet 4.6 через OpenRouter

Чтобы использовать Claude в чате ИИ (админка и Telegram-бот), выполните:

## 1. Получите API-ключ OpenRouter

1. Зарегистрируйтесь на [OpenRouter](https://openrouter.ai/)
2. Перейдите в [Keys](https://openrouter.ai/keys)
3. Создайте новый ключ и скопируйте его

## 2. Добавьте ключ в .env

В корне проекта откройте файл `.env` и добавьте:

```
AGENT_OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxx
```

(подставьте ваш ключ вместо `sk-or-v1-...`)

## 3. Перезапустите приложение

После сохранения `.env` перезапустите:

- Next.js: `npm run dev`
- Агент: `npm run agent:serve`
- Telegram-бот: `npm run bot:start`

## 4. Выберите Claude в админке

1. Откройте админ-панель → вкладка «Комиссионка AI»
2. В выпадающем списке «Модель» выберите **Claude Sonnet 4.6**

## Доступные модели OpenRouter

- **anthropic/claude-sonnet-4.6** — Claude Sonnet 4.6 (рекомендуется)
- **anthropic/claude-opus-4.5** — Claude Opus 4.5
- **anthropic/claude-3.5-sonnet** — Claude 3.5 Sonnet

## Стоимость

OpenRouter взимает плату за использование. Цены: [openrouter.ai/models](https://openrouter.ai/models)

Модель Claude Sonnet 4.6: ~$3/M токенов (ввод), ~$15/M токенов (вывод).
