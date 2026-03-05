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

export async function generateItemImageFile(params: GenerateItemImageParams): Promise<{
  url: string;
  filename: string;
}> {
  const { itemId, title, description, variantIndex } = params;

  const apiKey = process.env.AGENT_LLM_API_KEY;
  if (!apiKey) {
    throw new Error("AGENT_LLM_API_KEY is not configured");
  }

  const promptParts: string[] = [];
  promptParts.push(
    "Сгенерируй фотореалистичное изображение товара для онлайн-комиссионки. Без текста, без логотипов и без водяных знаков, на нейтральном фоне."
  );
  promptParts.push(`Товар: ${title}`);
  if (description && description.trim()) {
    promptParts.push(`Описание: ${description}`);
  }
  if (typeof variantIndex === "number") {
    promptParts.push(`Это вариант №${variantIndex}. Сделай его немного отличающимся от предыдущих.`);
  }
  const prompt = promptParts.join("\n");

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

  const proxyUrl = getProxyUrl();
  if (!proxyUrl) {
    throw new Error(
      "Для запросов к Gemini задайте прокси в .env: AGENT_PROXY или AGENT_HTTPS_PROXY или AGENT_HTTP_PROXY (например AGENT_PROXY=https://proxy.example.com:8080)"
    );
  }
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
  if (!imagePart?.inlineData?.data) {
    throw new Error("Gemini не вернул изображение");
  }

  const mimeType: string = imagePart.inlineData.mimeType || "image/png";
  const base64: string = imagePart.inlineData.data;

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
