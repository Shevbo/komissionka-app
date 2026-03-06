/**
 * Контракт агента (Этап 1.2).
 *
 * Вход:
 *   - prompt: string — текстовый промпт от пользователя
 *   - options (опционально): maxOutputLength, timeoutMs
 *
 * Выход:
 *   - result: string — финальная выдача для пользователя
 *   - debugLog (опционально): структурированный лог шагов, только для отладки/логов
 *
 * Формат вызова (на данном этапе выбран Вариант 2):
 *   Процесс: stdin — промпт (тело запроса), stdout — финальный ответ.
 *   Запуск: echo "промпт" | npm run agent:start
 *   Альтернативы на следующих этапах: HTTP POST { "prompt": "..." } → { "result": "..." } (Вариант 1), MCP-сервер (Вариант 3).
 */

/** Один оборот диалога для контекста (без tool-сообщений). */
export interface AgentHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

/** Режим работы: chat — курилка, consult — консультация (только чтение), dev — разработка (полный доступ). */
export type AgentMode = "chat" | "consult" | "dev";

export interface AgentOptions {
  /** Максимальная длина ответа (символы). Не применяется в заглушке. */
  maxOutputLength?: number;
  /** Таймаут запроса (мс). Не применяется в заглушке. */
  timeoutMs?: number;
  /** Предыдущие реплики чата: модель получит полный контекст перед текущим prompt. */
  history?: AgentHistoryTurn[];
  /** Вызывается при каждом шаге (для потокового вывода в UI). */
  onStep?: (step: import("./core.js").AgentStep) => void;
  /** Режим работы с ИИ: chat, consult, dev. По умолчанию dev. */
  mode?: AgentMode;
  /** Переопределение модели (id), базового URL и API-ключа. */
  modelOverride?: { model: string; baseUrl?: string; apiKey?: string };
  /** Отображаемое имя модели (из dropdown), для префикса ответа. */
  modelDisplayName?: string;
  /** Проект (например «Комиссионка»). Для кэша и универсальности агента. */
  project?: string;
  /** Учётная запись пользователя (для кэша). */
  userAccount?: string | null;
  /** Название чата (для кэша). */
  chatName?: string | null;
  /** Среда вызова: admin, telegram, api. */
  environment?: string;
  /**
   * Входные изображения (например, фото из Telegram или вложения из админки).
   * data — base64 без data:-префикса.
   */
  inputImages?: Array<{ mimeType: string; data: string }>;
  /** Отключить кэширование (agent_prompt_cache) для этого запроса. */
  disableCache?: boolean;
}

export type { AgentStep } from "./core.js";

export interface AgentResponse {
  /** Финальный текстовый ответ для пользователя. */
  result: string;
  /** Главные события хода выполнения (для панели). */
  steps?: import("./core.js").AgentStep[];
  /** Идентификатор файла с полным логом рассуждений (для кнопки «Посмотреть весь путь рассуждений ИИ»). */
  logId?: string;
  /** Лог шагов (только для отладки, не отдавать пользователю). */
  debugLog?: unknown;
}

import { getConfig } from "./config.js";
import type { AgentStep } from "./core.js";
import { runAgentCore, writeAgentLogToFile, stripPrefixChain } from "./core.js";
import { buildReportFooter, readVersions, countWordsForFooter } from "./lib/report-footer.js";
import { getServicesStatus } from "./lib/services-status.js";
import { tryHandleAgentCommand } from "./agent-commands.js";
import {
  findSimilar,
  saveToCache,
  trimCacheIfNeeded,
  type CacheMetadata,
} from "./cache/index.js";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("TIMEOUT")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function countWords(s: string): number {
  return s.split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * Выполняет запрос к агенту: LLM + инструменты, с таймаутом и обработкой ошибок.
 */
export async function runAgent(
  prompt: string,
  options?: AgentOptions
): Promise<AgentResponse> {
  const config = getConfig();
  const timeoutMs = options?.timeoutMs ?? config.timeoutMs;
  const debugLog: unknown[] = [];
  const stepsRef = { current: [] as AgentStep[] };
  const project = options?.project ?? config.defaultProject;
  const environment = options?.environment ?? "api";
  const isBacklogPrompt =
    (typeof options?.chatName === "string" && options.chatName.startsWith("backlog:")) ||
    (options?.project === "Комиссионка backlog");
  const disableCache =
    options?.disableCache === true || isBacklogPrompt;

  const metadata: CacheMetadata = {
    project,
    userAccount: options?.userAccount ?? null,
    llmModel: options?.modelOverride?.model ?? config.llmModel ?? null,
    historyTurns: options?.history?.length ?? 0,
    environment,
    mode: options?.mode ?? "dev",
    chatName: options?.chatName ?? null,
  };

  const trimmedPrompt = prompt.trim();

  try {
    if (trimmedPrompt.toLowerCase().startsWith("@agent:")) {
      const cmdResult = await tryHandleAgentCommand(trimmedPrompt, project);
      if (cmdResult.handled) {
        return {
          result: cmdResult.response,
          steps: [],
          logId: undefined,
        };
      }
    }

    const isConfirmationCode =
      metadata.mode === "dev" &&
      (/^\d{4}$/.test(trimmedPrompt) || /^(?:код\s*:?\s*|подтвержд\w*\s*:?\s*)?\d{4}\s*$/i.test(trimmedPrompt));
    const forceFresh =
      disableCache ||
      /^!/.test(trimmedPrompt) ||
      /\bforce\b/i.test(trimmedPrompt) ||
      isConfirmationCode ||
      (metadata.mode === "dev" && /^откат\s+\d{4}\s*$/i.test(trimmedPrompt));
    const promptForLlm = forceFresh ? trimmedPrompt.replace(/^!\s*/, "").trim() : trimmedPrompt;

    if (!forceFresh && !disableCache && config.cacheSimilarityThreshold > 0) {
      const similar = await findSimilar(promptForLlm, metadata, config.cacheSimilarityThreshold);
      if (similar.length > 0) {
        const top = similar[0]!;
        let body = stripPrefixChain(top.entry.response);
        // Старые записи кэша могли сохранить /uploads/agent/ — нормализуем в /api/uploads/agent/
        body = body.replace(/\]\(\/uploads\/agent\//g, "](/api/uploads/agent/");
        const footerIdx = body.indexOf("\n\n---\nМодель:");
        if (footerIdx >= 0) body = body.slice(0, footerIdx);
        const cachePrefix = `[Из кэша, совпадение ${Math.round(top.similarity)}%] Модель: ${top.entry.llm_model ?? "—"}, чат: ${top.entry.chat_name ?? "—"}, дата: ${top.entry.created_at instanceof Date ? top.entry.created_at.toISOString() : top.entry.created_at}\n\n`;
        const mode = (metadata.mode ?? "dev") as "chat" | "consult" | "dev";
        const versions = readVersions(config.root);
        const servicesStatus = getServicesStatus(config.root);
        const footer = buildReportFooter({
          model: top.entry.llm_model ?? "—",
          project,
          mode,
          inputChars: promptForLlm.length,
          outputChars: body.length,
          inputWords: countWords(promptForLlm),
          outputWords: countWords(body),
          root: config.root,
          versionsBefore: versions,
          hadModifications: false,
          servicesStatus,
        });
        return {
          result: cachePrefix + body + footer,
          steps: [],
          logId: undefined,
        };
      }
    }

    const coreResult = await withTimeout(
      runAgentCore(promptForLlm, options?.history, {
        onStep: options?.onStep,
        mode: options?.mode,
        stepsRef,
        modelOverride: options?.modelOverride,
        modelDisplayName: options?.modelDisplayName,
        project,
        inputImages: options?.inputImages,
      }),
      timeoutMs
    );
    const logId = coreResult.logEntries.length > 0
      ? `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      : undefined;
    if (logId) {
      try {
        writeAgentLogToFile(config.root, logId, coreResult.logEntries);
      } catch {
        // ignore
      }
    }

    if (!disableCache) {
      try {
        const sysPromptLen = 0;
        await saveToCache(metadata, promptForLlm, coreResult.result, {
          wordsSent: countWords(promptForLlm) + sysPromptLen,
          wordsReceived: countWords(coreResult.result),
          systemPromptLen: sysPromptLen,
        });
        await trimCacheIfNeeded(config.cacheMaxBytes);
      } catch {
        // ignore cache errors
      }
    }

    return {
      result: coreResult.result,
      steps: coreResult.steps,
      logId,
      debugLog: config.debug ? { steps: coreResult.steps.length, promptLength: prompt.length } : undefined,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const causeMsg =
      e instanceof Error && e.cause
        ? e.cause instanceof Error
          ? e.cause.message
          : String(e.cause)
        : "";
    if (config.debug) {
      debugLog.push({ error: message, cause: causeMsg || undefined });
    }
    console.error("[agent]", message);
    if (causeMsg) console.error("[agent] причина:", causeMsg);

    const userMessage =
      message === "TIMEOUT"
        ? "Превышено время ожидания. Попробуйте короче запрос или увеличьте AGENT_TIMEOUT_MS."
        : config.debug
          ? `Сервис временно недоступен. Ошибка: ${message}${causeMsg ? `. Причина: ${causeMsg}` : ""}`
          : "Сервис временно недоступен. Попробуйте позже.";
    const errorLogEntry = `[${new Date().toISOString()}] Ошибка: ${message}${causeMsg ? `; причина: ${causeMsg}` : ""}`;
    let errorLogId: string | undefined;
    try {
      errorLogId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      writeAgentLogToFile(config.root, errorLogId, [errorLogEntry]);
    } catch {
      // ignore
    }
    return {
      result: userMessage,
      steps: stepsRef.current.length > 0 ? stepsRef.current : undefined,
      logId: errorLogId,
      debugLog: config.debug ? { error: message } : undefined,
    };
  }
}
