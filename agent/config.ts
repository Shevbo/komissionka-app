/**
 * Окружение и конфигурация агента (Этап 1.3).
 * Источники: переменные окружения с префиксом AGENT_, опционально agent/config.json.
 * Переменные окружения имеют приоритет над config.json.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const agentDir = dirname(fileURLToPath(import.meta.url));

export interface AgentConfig {
  /** Рабочая директория агента (корень репозитория). Все пути к файлам — относительно неё. */
  root: string;
  /** Включить отладочный лог в ответе (debugLog). */
  debug: boolean;
  /** API-ключ облачной LLM (для этапов 3+). */
  llmApiKey: string | undefined;
  /** Модель LLM (например, gpt-4o, claude-3-5-sonnet, ollama/llama3). */
  llmModel: string | undefined;
  /** Базовый URL API (для Ollama: http://localhost:11434/v1, опционально). */
  llmBaseUrl: string | undefined;
  /** Таймаут одного запроса к агенту (мс). */
  timeoutMs: number;
  /** Максимальная длина ответа (символов). */
  maxOutputLength: number;
  /** Путь к файлу с контекстом проекта (относительно корня), например docs/AGENT-CONTEXT.md. Содержимое подставляется в системный промпт. */
  contextFilePath: string | undefined;
  /** Порт HTTP-сервера (режим «долгоживущий процесс», Вариант A). По умолчанию 3140. */
  serverPort: number;
  /** Секрет для вызова API (заголовок Authorization: Bearer <key> или X-API-Key). Если не задан — проверка не выполняется (только для доверенных сетей). */
  apiKey: string | undefined;
  /** Прокси для запросов к LLM (например, https://proxy.example.com:443). Поддерживаются http и https. Запросы к API пойдут через прокси — полезно при региональных ограничениях. */
  proxyUrl: string | undefined;
  /** Таймаут подключения к прокси (мс). По умолчанию 30000. */
  proxyConnectTimeoutMs: number;
  /** Уровень «рассуждений» для Gemini (например low, medium, high). Опционально; не все модели поддерживают. */
  thinkingLevel: string | undefined;
  /** Порог сходства промптов (0–100): при совпадении > N% показывать кэш вместо вызова LLM. */
  cacheSimilarityThreshold: number;
  /** Макс. объём кэша в байтах (по умолчанию 4 ГБ). */
  cacheMaxBytes: number;
  /** Проект по умолчанию (например «Комиссионка»). */
  defaultProject: string;
  /** Макс. символов кода в системном промпте (0 = не передавать, модель использует read_file). Экономия токенов. */
  fullCodeMaxChars: number;
  /** Макс. символов результата инструмента в контексте LLM (обрезание для экономии). */
  toolResultMaxCharsInContext: number;
  /** Макс. символов на одну реплику истории (user/assistant) в контексте. */
  historyTurnMaxChars: number;
  /** Базовый URL приложения для curl (GET/POST/DELETE к /api/). По умолчанию http://localhost:3000. Для прод-сервера: http://83.69.248.175:3000 */
  appUrl: string;
  /** Отдельный API‑ключ для OpenRouter (альтернатива Google Gemini). */
  openRouterApiKey?: string;
  /** Базовый URL OpenRouter (по умолчанию https://openrouter.ai/api/v1). */
  openRouterBaseUrl?: string;
}

const DEFAULT_TIMEOUT_MS = 600_000;
const DEFAULT_MAX_OUTPUT_LENGTH = 2 * 1024 * 1024; // 2MB — для ответов с картинками (base64 до замены на URL)
const DEFAULT_SERVER_PORT = 3140;
const DEFAULT_PROXY_CONNECT_TIMEOUT_MS = 30_000;

/** Модели для режима FAST: по умолчанию 2.5-flash (gemini-2.0-flash снят с API), можно задать AGENT_LLM_MODEL_FAST. */
const FAST_LLM_MODEL_DEFAULT = "gemini-2.5-flash";

/** Снятая с API модель — подменяем на актуальную при любом источнике (env, config.json). */
function normalizeDeprecatedModel(model: string | undefined): string | undefined {
  if (!model?.trim()) return model;
  const m = model.trim();
  if (m === "gemini-2.0-flash" || m === "models/gemini-2.0-flash") return "gemini-2.5-flash";
  return m;
}

function loadConfigJson(): Partial<Record<string, string | number | boolean>> {
  const path = join(agentDir, "config.json");
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as Partial<Record<string, string | number | boolean>>;
  } catch {
    return {};
  }
}

function envBool(name: string): boolean {
  const v = process.env[name];
  return v === "1" || v?.toLowerCase() === "true" || v?.toLowerCase() === "yes";
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Возвращает конфигурацию агента. Сначала читается config.json (если есть),
 * затем значения переопределяются переменными окружения AGENT_*.
 */
export function getConfig(): AgentConfig {
  const file = loadConfigJson();
  const root =
    process.env.AGENT_ROOT ??
    (file.root as string | undefined) ??
    process.cwd();
  return {
    root: resolve(root),
    debug:
      process.env.AGENT_DEBUG !== undefined
        ? envBool("AGENT_DEBUG")
        : (file.debug as boolean | undefined) ?? false,
    // Ключ LLM по умолчанию: AGENT_LLM_API_KEY (для Google Gemini / совместимого API)
    // либо значение из config.json (для dev-контура).
    llmApiKey:
      process.env.AGENT_LLM_API_KEY ??
      (file.llmApiKey as string | undefined),
    llmModel: (() => {
      const mode = (process.env.AGENT_LLM_MODE ?? (file.llmMode as string | undefined))?.toUpperCase();
      if (mode === "FAST") {
        const fastModel = process.env.AGENT_LLM_MODEL_FAST ?? (file.llmModelFast as string | undefined);
        return normalizeDeprecatedModel(fastModel?.trim() || FAST_LLM_MODEL_DEFAULT) ?? FAST_LLM_MODEL_DEFAULT;
      }
      return normalizeDeprecatedModel(process.env.AGENT_LLM_MODEL ?? (file.llmModel as string | undefined));
    })(),
    // Базовый URL по умолчанию (Google Gemini или любой OpenAI-совместимый endpoint).
    llmBaseUrl:
      process.env.AGENT_LLM_BASE_URL ?? (file.llmBaseUrl as string | undefined),
    timeoutMs: envInt(
      "AGENT_TIMEOUT_MS",
      (file.timeoutMs as number | undefined) ?? DEFAULT_TIMEOUT_MS
    ),
    maxOutputLength: envInt(
      "AGENT_MAX_OUTPUT_LENGTH",
      (file.maxOutputLength as number | undefined) ?? DEFAULT_MAX_OUTPUT_LENGTH
    ),
    contextFilePath:
      process.env.AGENT_CONTEXT_FILE ?? (file.contextFilePath as string | undefined),
    serverPort: envInt(
      "AGENT_PORT",
      (file.serverPort as number | undefined) ?? DEFAULT_SERVER_PORT
    ),
    apiKey:
      process.env.AGENT_API_KEY ?? (file.apiKey as string | undefined),
    proxyUrl:
      process.env.AGENT_PROXY ??
      process.env.AGENT_HTTPS_PROXY ??
      process.env.AGENT_HTTP_PROXY ??
      (file.proxyUrl as string | undefined),
    proxyConnectTimeoutMs: envInt(
      "AGENT_PROXY_CONNECT_TIMEOUT_MS",
      (file.proxyConnectTimeoutMs as number | undefined) ?? DEFAULT_PROXY_CONNECT_TIMEOUT_MS
    ),
    thinkingLevel: (() => {
      const mode = (process.env.AGENT_LLM_MODE ?? (file.llmMode as string | undefined))?.toUpperCase();
      if (mode === "FAST") return undefined;
      return process.env.AGENT_THINKING_LEVEL ?? (file.thinkingLevel as string | undefined);
    })(),
    cacheSimilarityThreshold: envInt(
      "AGENT_CACHE_SIMILARITY_THRESHOLD",
      (file.cacheSimilarityThreshold as number | undefined) ?? 70
    ),
    cacheMaxBytes: envInt(
      "AGENT_CACHE_MAX_BYTES",
      (file.cacheMaxBytes as number | undefined) ?? 4 * 1024 * 1024 * 1024
    ),
    defaultProject:
      process.env.AGENT_PROJECT ?? (file.defaultProject as string | undefined) ?? "Комиссионка",
    fullCodeMaxChars: envInt(
      "AGENT_FULL_CODE_MAX_CHARS",
      (file.fullCodeMaxChars as number | undefined) ?? 0
    ),
    toolResultMaxCharsInContext: envInt(
      "AGENT_TOOL_RESULT_MAX_CHARS",
      (file.toolResultMaxCharsInContext as number | undefined) ?? 8000
    ),
    historyTurnMaxChars: envInt(
      "AGENT_HISTORY_TURN_MAX_CHARS",
      (file.historyTurnMaxChars as number | undefined) ?? 6000
    ),
    appUrl: (() => {
      const url = (process.env.AGENT_APP_URL ?? (file.appUrl as string | undefined))?.trim();
      if (url) return url;
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "AGENT_APP_URL is required in production. Add it to .env (e.g. https://your-domain.ru) to avoid curl requests to localhost."
        );
      }
      return "http://localhost:3000";
    })(),
    openRouterApiKey:
      process.env.AGENT_OPENROUTER_API_KEY ?? (file.openRouterApiKey as string | undefined),
    openRouterBaseUrl:
      process.env.AGENT_OPENROUTER_BASE_URL ?? (file.openRouterBaseUrl as string | undefined),
  };
}
