# Рабочая документация на агент к модели ИИ вер. 1.3.7

## Оглавление

1. [Технологический стек](#1-технологический-стек)
2. [Архитектура](#2-архитектура)
3. [Функциональные блоки](#3-функциональные-блоки)
4. [Системный промпт и экономия токенов](#4-системный-промпт-и-экономия-токенов)
5. [Модель данных и кэш](#5-модель-данных-и-кэш)
6. [Доступ к Prisma и консоль](#6-доступ-к-prisma-и-консоль)
7. [Deploy: от разработки до продакшена](#7-deploy-от-разработки-до-продакшена)

---

## 1. Технологический стек

| Компонент | Технология |
|-----------|------------|
| Язык | TypeScript (ESM) |
| Сборка | esbuild |
| LLM | HTTP API (OpenAI-совместимый), Gemini, Ollama |
| Кэш | PostgreSQL (таблица agent_prompt_cache) |
| Запуск | Node.js 20, PM2 |

---

## 2. Архитектура

Агент — отдельный процесс в контексте репозитория «Комиссионка». Режимы входа:

- **CLI** (run.ts) — разовый запуск, промпт из stdin или аргумента
- **HTTP** (serve.ts) — долгоживущий сервер: POST /run { prompt, history?, mode?, model? }

Цикл: промпт → LLM → инструменты → ответ (до MAX_TOOL_ITERATIONS шагов).

Структура agent/: run.ts, serve.ts, core.ts, contract.ts, config.ts, llm/, tools/, cache/, lib/.

---

## 3. Функциональные блоки

### 3.1 Точки входа

| Файл | Описание |
|------|----------|
| agent/run.ts | CLI: чтение промпта, вызов runAgent |
| agent/serve.ts | HTTP: POST /run, вызов runAgent, JSON ответ |
| agent/contract.ts | runAgent() — кэш, core.runAgentCore, сохранение в кэш |

### 3.2 Ядро

| Файл | Описание |
|------|----------|
| agent/core.ts | runAgentCore() — цикл history → LLM → tools; логи в .agent-logs/ |

### 3.3 Конфигурация

| Файл | Описание |
|------|----------|
| agent/config.ts | getConfig() — AGENT_* env, config.json: root, llmApiKey, llmModel, appUrl, cacheSimilarityThreshold и др. |

### 3.4 LLM

| Файл | Описание |
|------|----------|
| agent/llm/index.ts | request() — маршрутизация Google / OpenAI; для Gemini поддерживает мультимодальный ввод через inlineData (inputImages) и вывод изображений |
| agent/llm/system-prompt.ts | getSystemPrompt(), getSystemPromptForChat() — промпт по режиму (chat/consult/dev) |

### 3.5 Инструменты

read_file, write_file, list_dir, find_files, grep, run_command — agent/tools/*.ts. Роутер: agent/tools/index.ts executeTool().

### 3.6 Кэш

| Файл | Описание |
|------|----------|
| agent/cache/index.ts | findSimilar, saveEntry — agent_prompt_cache |
| agent/cache/similarity.ts | textSimilarity() |

---

## 4. Системный промпт и экономия токенов

Правила: минимальный, но полный промпт; контекст согласован с Cursor; без дублирования запросов; кэш при сходстве > cacheSimilarityThreshold; ограничения fullCodeMaxChars, toolResultMaxCharsInContext, historyTurnMaxChars.

Режимы: chat (курилка), consult (чтение), dev (полный доступ).

---

## 5. Модель данных и кэш

Таблица agent_prompt_cache (prisma/schema.prisma): id, prompt, response, project, user_account, mode, llm_model, prompt_hash, history_turns, words_sent, words_received, topic, chat_name.

---

## 6. Доступ к Prisma и консоль

DATABASE_URL — тот же, что у приложения. Просмотр кэша: npx prisma studio или psql. Запуск: npm run agent:serve, порт 3140. Переменные: AGENT_PORT, AGENT_API_KEY, AGENT_LLM_API_KEY, AGENT_APP_URL.

---

## 7. Deploy: от разработки до продакшена

### 7.1 Условная схема: от разработки до внедрения в прод

```
[Разработка] → [Коммит] → [Загрузка на сервер] → [Применение на сервере]
     │              │              │                        │
     │              │              │                        └─ pm2 restart agent
     │              │              └─ rsync / incremental scp / full scp
     │              └─ version.json, what's new.md (agent)
     └─ agent/ — изменение кода (core, tools, llm, config и др.)
```

**Этапы:**

1. **Разработка** — правки в `agent/`. Агент — TypeScript без предварительной сборки; `tsx` запускает исходники.
2. **Версионирование** — обновление `version.json` (agent), блок UPDATE в `what's new.md`.
3. **Загрузка** — синхронизация всего репозитория (агент входит в него). Инкрементальная синхронизация передаёт только изменённые файлы.
4. **Применение** — на сервере: `pm2 restart agent` (в составе общего деплоя — `pm2 restart komissionka agent bot`).

### 7.2 Месторасположение изменённого кода (Dev)

| Компонент | Каталог / файлы |
|-----------|-----------------|
| Ядро и точка входа | `agent/run.ts`, `agent/serve.ts`, `agent/core.ts`, `agent/contract.ts` |
| Конфигурация | `agent/config.ts`, `agent/config.json` |
| LLM | `agent/llm/` |
| Инструменты | `agent/tools/` |
| Кэш | `agent/cache/` |

Корень репозитория — каталог с `package.json`. Агент — подкаталог `agent/`.

### 7.3 Целевое расположение на сервере (Prod)

| Элемент | Путь на сервере |
|---------|-----------------|
| Репозиторий (включая agent/) | `~/komissionka` |
| Код агента | `~/komissionka/agent/` |
| Запуск | PM2: процесс `agent` (`npm run agent:serve`) |

Сервер: VPS 83.69.248.175. Агент слушает порт 3140 (AGENT_PORT).

### 7.4 Инструкция по инкрементальному и полному развёртыванию

**Скрипт деплоя:** [scripts/deploy-hoster.ps1](../../scripts/deploy-hoster.ps1)

Агент разворачивается вместе с приложением и ботом — общий скрипт синхронизирует весь репозиторий.

**Полный деплой:**

```powershell
.\scripts\deploy-hoster.ps1 -All
```

**Инкрементальная синхронизация** — как у приложения: rsync или PowerShell по размеру файлов; при сбое — полный scp.

**Только перезапуск агента** (код уже на сервере):

```bash
ssh hoster "cd ~/komissionka && pm2 restart agent"
```

**Полный цикл вручную:**

```bash
ssh hoster "cd ~/komissionka && pm2 restart komissionka agent bot"
```
