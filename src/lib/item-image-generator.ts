import { GoogleGenAI } from "@google/genai";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const UPLOADS_ITEMS_DIR = path.join(process.cwd(), "public", "uploads", "items");
const DEFAULT_MODEL = process.env.ITEM_IMAGE_MODEL || "gemini-2.5-flash";

let aiClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.AGENT_LLM_API_KEY;
    if (!apiKey) {
      throw new Error("AGENT_LLM_API_KEY is not configured");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
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

  const ai = getClient();
  const interaction: any = await ai.interactions.create({
    model: DEFAULT_MODEL,
    input: [{ type: "text", text: prompt }],
    response_modalities: ["image"],
  });

  const outputs: any[] = interaction?.outputs ?? [];
  const imageOutput = outputs.find(
    (o) => o && o.type === "image" && typeof o.data === "string"
  );

  if (!imageOutput) {
    throw new Error("Gemini не вернул изображение");
  }

  const mimeType: string = imageOutput.mime_type || "image/png";
  const base64: string = imageOutput.data;

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

  const url = `/uploads/items/${filename}`;

  return { url, filename };
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

