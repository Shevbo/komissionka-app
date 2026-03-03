/**
 * Нативный клиент Gemini (generateContent). Корректно передаёт thought_signature
 * в запросах/ответах, без «амнезии» при tool calling. Используется при AGENT_LLM_BASE_URL
 * на generativelanguage.googleapis.com.
 */

import type { ChatMessage, ToolCall, AssistantMessage, LLMRequestOptions } from "./client.js";
import { ProxyAgent, fetch as undiciFetch } from "undici";

type Part =
  | { text: string }
  | { inlineData?: { mimeType?: string; data?: string } }
  | {
      functionCall: { name: string; args: Record<string, unknown> };
      thoughtSignature?: string;
      thought_signature?: string;
    }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

function openAiToolsToGemini(tools: unknown[]): { functionDeclarations: Array<{ name: string; description: string; parameters: Record<string, unknown> }> } {
  const decls: Array<{ name: string; description: string; parameters: Record<string, unknown> }> = [];
  for (const t of tools) {
    if (typeof t !== "object" || t === null || !("function" in t)) continue;
    const fn = (t as { function: { name: string; description: string; parameters: Record<string, unknown> } }).function;
    if (!fn?.name) continue;
    decls.push({
      name: fn.name,
      description: typeof fn.description === "string" ? fn.description : "",
      parameters: (fn.parameters && typeof fn.parameters === "object") ? fn.parameters : { type: "object", properties: {} },
    });
  }
  return { functionDeclarations: decls };
}

function messagesToContents(
  messages: ChatMessage[],
  thoughtSignatureFromPrevious?: string
): Array<{ role: "user" | "model"; parts: Part[] }> {
  const contents: Array<{ role: "user" | "model"; parts: Part[] }> = [];
  let toolResponseParts: Part[] = [];

  function flushToolResponses() {
    if (toolResponseParts.length) {
      contents.push({ role: "user", parts: toolResponseParts });
      toolResponseParts = [];
    }
  }

  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") {
      flushToolResponses();
      const parts: Part[] = [];
      if (m.content) parts.push({ text: m.content });
      contents.push({ role: "user", parts });
      continue;
    }
    if (m.role === "assistant") {
      flushToolResponses();
      const parts: Part[] = [];
      if (m.content) parts.push({ text: m.content });
      if (m.tool_calls?.length) {
        const fallbackSig = thoughtSignatureFromPrevious ?? "";
        for (const tc of m.tool_calls) {
          const sig = tc.thought_signature ?? (tc as { thoughtSignature?: string }).thoughtSignature ?? fallbackSig;
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
          } catch {
            args = {};
          }
          const part: Part = {
            functionCall: { name: tc.function.name, args },
            ...(sig ? { thoughtSignature: sig, thought_signature: sig } : {}),
          };
          parts.push(part);
        }
      }
      if (parts.length) contents.push({ role: "model", parts });
      continue;
    }
    if (m.role === "tool" && m.name && m.content !== undefined) {
      toolResponseParts.push({
        functionResponse: { name: m.name, response: { result: m.content } },
      });
    }
  }
  flushToolResponses();
  return contents;
}

export async function requestGoogleNative(
  messages: ChatMessage[],
  tools: unknown[] | undefined,
  options: LLMRequestOptions
): Promise<AssistantMessage> {
  const { model, apiKey, baseUrl, maxTokens = 4096, requestTimeoutMs = 60000, proxyUrl, proxyConnectTimeoutMs = 30000, thoughtSignature } = options;
  if (!apiKey) throw new Error("Google native API requires AGENT_LLM_API_KEY");

  const base = (baseUrl ?? "").replace(/\/$/, "");
  const baseNative = base.replace(/\/v1beta\/openai.*$/i, "/v1beta").replace(/\/openai.*$/i, "") || "https://generativelanguage.googleapis.com/v1beta";
  const urlBase = `${baseNative}/models/${model}:generateContent`;
  const url = `${urlBase}?key=${encodeURIComponent(apiKey)}`;

  const systemMessages = messages.filter((m) => m.role === "system");
  const systemInstruction = systemMessages.length
    ? { parts: [{ text: systemMessages.map((m) => m.content).join("\n\n") }] }
    : undefined;
  const restMessages = messages.filter((m) => m.role !== "system");
  const contents = messagesToContents(restMessages, thoughtSignature);

  const generationConfig: Record<string, unknown> = { maxOutputTokens: maxTokens };
  if (options.thinkingLevel && typeof options.thinkingLevel === "string") {
    generationConfig.thinkingLevel = options.thinkingLevel.trim().toLowerCase();
  }
  if (options.responseModalitiesImage) {
    generationConfig.responseModalities = ["TEXT", "IMAGE"];
  }
  const body: Record<string, unknown> = {
    contents,
    generationConfig,
  };
  if (systemInstruction) body.systemInstruction = systemInstruction;
  // Image-модели (gemini-2.5-flash-image, gemini-3-pro-image-preview) не поддерживают function calling
  const modelId = (model ?? "").replace(/^models\//, "").toLowerCase();
  const supportsFunctionCalling = !modelId.includes("-image");
  if (tools?.length && supportsFunctionCalling) {
    body.tools = [openAiToolsToGemini(tools)];
    body.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    // Поправка «грамматики» запроса: передаём ключ и как x-goog-api-key, и (для внешних прокси) в Authorization.
    headers["x-goog-api-key"] = apiKey;
    headers.Authorization = `Bearer ${apiKey}`;
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
    const text = await res.text();
    if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 500)}`);

    const data = JSON.parse(text) as Record<string, unknown>;
    const candidates = data.candidates as Array<{ content?: { parts?: Part[] }; finishReason?: string }> | undefined;
    const content = candidates?.[0]?.content;
    const parts = content?.parts ?? [];

    const tool_calls: ToolCall[] = [];
    const contentParts: string[] = [];
    let lastThought: string | undefined;

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p || typeof p !== "object") continue;
      if ("text" in p && typeof p.text === "string") {
        contentParts.push(p.text);
      }
      if ("inlineData" in p && p.inlineData) {
        const id = p.inlineData as { mimeType?: string; data?: string };
        const mime = id.mimeType ?? "image/png";
        const data = id.data ?? "";
        if (data) contentParts.push(`\n\n![generated](data:${mime};base64,${data})\n\n`);
      }
      if ("functionCall" in p && p.functionCall) {
        const fc = p.functionCall as { name: string; args?: Record<string, unknown> };
        const sig =
          ("thoughtSignature" in p && typeof (p as { thoughtSignature?: string }).thoughtSignature === "string"
            ? (p as { thoughtSignature: string }).thoughtSignature
            : undefined) ??
          ("thought_signature" in p && typeof (p as { thought_signature?: string }).thought_signature === "string"
            ? (p as { thought_signature: string }).thought_signature
            : undefined);
        if (sig) lastThought = sig;
        tool_calls.push({
          id: `call_${i}_${Date.now()}`,
          type: "function",
          function: {
            name: fc.name ?? "",
            arguments: typeof fc.args === "object" && fc.args !== null ? JSON.stringify(fc.args) : "{}",
          },
          thought_signature: sig,
        });
      }
    }

    return {
      content: contentParts.length ? contentParts.join("").trim() : null,
      tool_calls: tool_calls.length ? tool_calls : undefined,
      thought_signature: lastThought ?? tool_calls.find((tc) => tc.thought_signature)?.thought_signature,
    };
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}
