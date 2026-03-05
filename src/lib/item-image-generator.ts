/**
 * Генерация иллюстраций к товарам через Gemini API.
 * Все запросы к Gemini идут строго через прокси из .env (AGENT_PROXY / AGENT_HTTPS_PROXY / AGENT_HTTP_PROXY).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProxyAgent, fetch as undiciFetch } from "undici";

const UPLOADS_ITEMS_DIR = path.join(process.cwd(), "public", "uploads", "items");
const DEFAULT_MODEL = process.env.ITEM_IMAGE_MODEL || "gemini-2.5-flash-image";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const PROXY_CONNECT_TIMEOUT_MS = Number(process.env.AGENT_PROXY_CONNECT_TIMEOUT_MS) || 30_000;

function getProxyUrl(): string | undefined {
  const u =
    process.env.AGENT_PROXY ??
    process.env.AGENT_HTTPS_PROXY ??
    process.env.AGENT_HTTP_PROXY;
  return typeof u === "string" && u.trim() ? u.trim() : undefined;
}

type GenerateItemImageParams = {
  itemId?: string;
  title: string;
  description?: string | null;
  variantIndex?: number;
};

const MAX_IMAGE_RETRIES = 3;

/** Варианты промпта для повторных попыток, если модель вернула только текст. */
function buildPromptVariants(
  title: string,
  description: string | null | undefined,
  variantIndex: number | undefined
): string[] {
  const base = `Товар: ${title}`;
  const desc = description?.trim() ? ` Описание: ${description.trim()}` : "";
  const variant =
    typeof variantIndex === "number"
      ? ` Вариант №${variantIndex}, немного другой ракурс или фон.`
      : "";

  return [
    `Сгенерируй одно фотореалистичное изображение товара для каталога. Без текста, логотипов и водяных знаков, нейтральный фон.\n${base}${desc}${variant}`,
    `Product photo, single object on white background, no text, no logos. Subject: ${title}.${desc ? ` ${description}` : ""}`,
    `One realistic product photo: ${title}. Clean background, no text.`,
  ];
}

async function requestImageFromGemini(prompt: string): Promise<{ mimeType: string; data: string } | null> {
  const apiKey = process.env.AGENT_LLM_API_KEY;
  if (!apiKey) throw new Error("AGENT_LLM_API_KEY is not configured");

  const proxyUrl = getProxyUrl();
  if (!proxyUrl) {
    throw new Error(
      "Для запросов к Gemini задайте прокси в .env: AGENT_PROXY или AGENT_HTTPS_PROXY или AGENT_HTTP_PROXY"
    );
  }

  const url = `${GEMINI_BASE}/models/${DEFAULT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      maxOutputTokens: 4096,
    },
  };

  const fetchOptions: RequestInit & { dispatcher?: import("undici").Dispatcher } = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
  fetchOptions.dispatcher = new ProxyAgent({
    uri: proxyUrl,
    proxyTls: { timeout: PROXY_CONNECT_TIMEOUT_MS },
  }) as import("undici").Dispatcher;

  const res = await undiciFetch(url, fetchOptions as any);
  const text = await res.text();
  if (!res.ok) {
    let errPayload: unknown;
    try {
      errPayload = JSON.parse(text);
    } catch {
      errPayload = { error: { message: text.slice(0, 500) } };
    }
    const err = new Error(
      typeof (errPayload as any)?.error?.message === "string"
        ? (errPayload as any).error.message
        : `Gemini API ${res.status}: ${text.slice(0, 300)}`
    ) as Error & { status?: number; error?: unknown };
    err.status = res.status;
    err.error = errPayload;
    throw err;
  }

  const data = JSON.parse(text) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> };
    }>;
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p?.inlineData?.data);
  if (!imagePart?.inlineData?.data) return null;
  return {
    mimeType: imagePart.inlineData.mimeType || "image/png",
    data: imagePart.inlineData.data,
  };
}

export async function generateItemImageFile(params: GenerateItemImageParams): Promise<{
  url: string;
  filename: string;
}> {
  const { itemId, title, description, variantIndex } = params;
  const prompts = buildPromptVariants(title, description, variantIndex);

  let image: { mimeType: string; data: string } | null = null;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < Math.min(MAX_IMAGE_RETRIES, prompts.length); attempt++) {
    try {
      image = await requestImageFromGemini(prompts[attempt]!);
      if (image) break;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  if (!image?.data) {
    throw lastError ?? new Error("Gemini не вернул изображение после нескольких попыток с разными промптами");
  }

  const mimeType: string = image.mimeType;
  const base64: string = image.data;

  const ext =
    mimeType.includes("png") ? "png" :
    mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" :
    mimeType.includes("webp") ? "webp" :
    "png";

  const safeId = (itemId ?? "item").replace(/[^a-zA-Z0-9_-]/g, "");
  const filename = `item-${safeId}-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;

  await mkdir(UPLOADS_ITEMS_DIR, { recursive: true });
  const buf = Buffer.from(base64, "base64");
  const filePath = path.join(UPLOADS_ITEMS_DIR, filename);
  await writeFile(filePath, buf);

  const imageUrl = `/uploads/items/${filename}`;
  return { url: imageUrl, filename };
}

export async function generateItemImagesBatch(params: {
  itemId?: string;
  title: string;
  description?: string | null;
  count: number;
}): Promise<string[]> {
  const urls: string[] = [];
  const count = Math.max(1, Math.min(10, params.count));

  for (let i = 0; i < count; i++) {
    const { url } = await generateItemImageFile({
      itemId: params.itemId,
      title: params.title,
      description: params.description,
      variantIndex: i + 1,
    });
    urls.push(url);
  }

  return urls;
}
