/**
 * Клиент LLM (Этап 3.1). Обёртка над OpenAI-совместимым API (OpenAI, Ollama и т.д.).
 * Для Gemini (generativelanguage.googleapis.com) используется нативный generateContent,
 * чтобы thought_signature работал без «амнезии» при tool calling.
 */

import { ProxyAgent, fetch as undiciFetch } from "undici";
import { requestGoogleNative } from "./client-google.js";

const OPENAI_BASE = "https://api.openai.com/v1";

/** Коды ошибок, при которых имеет смысл повторить запрос. */
const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "ENETUNREACH",
  "ENETRESET",
  "ECONNABORTED",
]);

function isRetryableNetworkError(err: unknown): boolean {
  const e = err instanceof Error ? err : new Error(String(err));
  const code =
    (e.cause && typeof e.cause === "object" && "code" in e.cause
      ? (e.cause as { code: string }).code
      : null) ??
    (err && typeof err === "object" && "code" in err ? (err as { code: string }).code : null);
  if (code && RETRYABLE_ERROR_CODES.has(code)) return true;
  const msg = e.message;
  return /ECONNRESET|ETIMEDOUT|fetch failed|network|socket hang up|abort/i.test(msg);
}

/** Ошибки API (503, 502, 429, UNAVAILABLE, high demand) — повтор запроса имеет смысл. */
function isRetryableHttpError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /\b503\b|\b502\b|\b429\b/i.test(msg) ||
    /UNAVAILABLE|high demand|try again later/i.test(msg)
  );
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  /** Required by Gemini 3 for tool calls; must be echoed back in the next request. */
  thought_signature?: string;
}

export interface AssistantMessage {
  content: string | null;
  tool_calls?: ToolCall[];
  /** Gemini 3: pass this in the next request body as thought_signature. */
  thought_signature?: string;
}

export interface LLMRequestOptions {
  model: string;
  apiKey: string | undefined;
  baseUrl: string | undefined;
  maxTokens?: number;
  requestTimeoutMs?: number;
  /** URL прокси для запросов к API (например, http://host:port). */
  proxyUrl?: string | undefined;
  /** Таймаут подключения к прокси (мс). По умолчанию 30000. */
  proxyConnectTimeoutMs?: number;
  /** Gemini 3: thought_signature from previous response for follow-up requests. */
  thoughtSignature?: string;
  /** Уровень рассуждений для Gemini (например low). Опционально. */
  thinkingLevel?: string;
  /** Включить вывод изображений (responseModalities: TEXT, IMAGE) для Gemini 2.5/3 при запросе картинки в промпте. */
  responseModalitiesImage?: boolean;
}

/**
 * Отправляет запрос к LLM. Возвращает сообщение ассистента (content и/или tool_calls).
 */
export async function request(
  messages: ChatMessage[],
  tools: unknown[] | undefined,
  options: LLMRequestOptions
): Promise<AssistantMessage> {
  const { model, apiKey, baseUrl, maxTokens = 4096, requestTimeoutMs = 60000, proxyUrl, proxyConnectTimeoutMs = 30000, thoughtSignature, thinkingLevel } = options;
  const base = (baseUrl ?? OPENAI_BASE).replace(/\/$/, "");
  const isGoogle = base.includes("generativelanguage.googleapis.com");

  // Gemini: нативный generateContent с корректной передачей thought_signature (без амнезии).
  if (isGoogle && apiKey) {
    const maxRetries = 5;
    const baseDelayMs = 2000;
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Для нативного клиента Google снова разрешаем HTTP‑прокси (если задан proxyUrl),
        // чтобы можно было использовать внешний прокси‑шлюз.
        return await requestGoogleNative(messages, tools, options);
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        const canRetry =
          attempt < maxRetries &&
          (isRetryableNetworkError(e) || isRetryableHttpError(e));
        if (canRetry) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          console.warn(`[llm] Повтор ${attempt}/${maxRetries} через ${delay}ms (${lastError.message.slice(0, 80)}…)`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw e;
      }
    }
    throw lastError ?? new Error("LLM request failed after retries");
  }

  // OpenAI-совместимый путь (OpenAI, Ollama и т.д.).
  let url = base + "/chat/completions";
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const maxRetries = 3;
  const baseDelayMs = 1500;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      const fetchOptions: RequestInit & { dispatcher?: import("undici").Dispatcher } = {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal as any,
      };
      if (proxyUrl?.trim()) {
        const proxyOpts = { uri: proxyUrl.trim(), proxyTls: { timeout: proxyConnectTimeoutMs } };
        fetchOptions.dispatcher = new ProxyAgent(proxyOpts) as import("undici").Dispatcher;
      }
      const res = await undiciFetch(url, fetchOptions as any);
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text();
        const retryableStatus = res.status === 429 || res.status === 503 || res.status === 502;
        if (attempt < maxRetries && retryableStatus) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw new Error(`LLM API error ${res.status}: ${text.slice(0, 500)}`);
      }

      const data = (await res.json()) as Record<string, unknown>;
      const choice0 = (data.choices as Array<Record<string, unknown>> | undefined)?.[0];
      const message = choice0?.message as Record<string, unknown> | undefined;
      if (!message) throw new Error("LLM returned empty choices");

      const rawToolCalls = message.tool_calls as Array<Record<string, unknown>> | undefined;
      const tool_calls: ToolCall[] | undefined = rawToolCalls?.map((tc) => {
        const fn = tc.function as { name: string; arguments: string };
        const sig =
          typeof tc.thought_signature === "string"
            ? tc.thought_signature
            : typeof (tc as { thoughtSignature?: string }).thoughtSignature === "string"
              ? (tc as { thoughtSignature: string }).thoughtSignature
              : undefined;
        return {
          id: String(tc.id),
          type: "function" as const,
          function: { name: fn?.name ?? "", arguments: typeof fn?.arguments === "string" ? fn.arguments : "{}" },
          ...(sig && { thought_signature: sig }),
        };
      });

      const msgSig =
        typeof message.thought_signature === "string"
          ? message.thought_signature
          : typeof (message as { thoughtSignature?: string }).thoughtSignature === "string"
            ? (message as { thoughtSignature: string }).thoughtSignature
            : undefined;
      const lastThought = msgSig ?? tool_calls?.find((tc) => tc.thought_signature)?.thought_signature;

      return {
        content: typeof message.content === "string" ? message.content : null,
        tool_calls: tool_calls?.length ? tool_calls : undefined,
        thought_signature: lastThought,
      };
    } catch (e) {
      clearTimeout(timeout);
      lastError = e instanceof Error ? e : new Error(String(e));
      const causeMsg = lastError.cause instanceof Error ? lastError.cause.message : "";
      const canRetry = attempt < maxRetries && isRetryableNetworkError(e);
      if (canRetry) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(`[llm] Сетевой сбой (${causeMsg || lastError.message}), повтор ${attempt}/${maxRetries} через ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (causeMsg && lastError.message === "fetch failed") {
        throw new Error(`fetch failed: ${causeMsg}`, { cause: lastError.cause });
      }
      throw e;
    }
  }

  throw lastError ?? new Error("LLM request failed after retries");
}
