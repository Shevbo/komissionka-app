/**
 * Список доступных моделей ИИ для переключения администратором.
 * Google AI Pro: https://ai.google.dev/gemini-api/docs/models
 * OpenRouter (Claude): https://openrouter.ai/models
 * Справка: /admin/agent-models-help
 */

/** Признак вывода модели: text, image, video, live */
export type OutputModality = "text" | "image" | "video" | "live";

/** Иконка типа модели по категории Google (Text-out, Multi-modal, Other). */
export type ModelTypeIcon = "📝" | "🖼️" | "🎬" | "📦";

export interface AgentModelOption {
  id: string;
  name: string;
  provider: "google" | "openrouter";
  description?: string;
  /** Ключ для якоря на странице справки (admin/agent-models-help#key) */
  helpKey?: string;
  /** chat = чат/агент, image = генерация изображений, video = генерация видео, embedding = эмбеддинги */
  capability?: "chat" | "image" | "video" | "embedding";
  /** Мультимодальная (ввод/вывод изображений) — для инфографики в списке */
  multimodal?: boolean;
  /** Признак вывода: text (только текст), image (включён responseModalities IMAGE) */
  outputModality?: OutputModality;
  /** Иконка типа: 📝 Text-out, 🖼️ Multi-modal (картинки), 🎬 Video, 📦 Other */
  typeIcon?: ModelTypeIcon;
}

/** Разделитель в id для кодирования modelId|outputModality */
export const MODEL_MODALITY_SEP = "|";

/** Парсит "modelId|modality" в { modelId, outputModality } */
export function parseModelIdWithModality(combined: string): { modelId: string; outputModality?: OutputModality } {
  const idx = combined.lastIndexOf(MODEL_MODALITY_SEP);
  if (idx < 0) return { modelId: combined };
  const modelId = combined.slice(0, idx);
  const modality = combined.slice(idx + 1) as OutputModality;
  if (["text", "image", "video", "live"].includes(modality)) {
    return { modelId, outputModality: modality };
  }
  return { modelId: combined };
}

/** Чат-модели Google AI (generateContent). ID из https://ai.google.dev/gemini-api/docs/models */
export const GOOGLE_CHAT_MODELS: AgentModelOption[] = [
  { id: "gemini-2.0-flash", name: "Gemini 2 Flash", provider: "google", helpKey: "gemini-2-flash", capability: "chat", typeIcon: "📝", multimodal: true },
  { id: "gemini-2.0-flash-lite", name: "Gemini 2 Flash Lite", provider: "google", helpKey: "gemini-2-flash-lite", capability: "chat", typeIcon: "📝", multimodal: true },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google", helpKey: "gemini-2-5-flash", capability: "chat", typeIcon: "📝", description: "Быстрая, 1M токенов", multimodal: true },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", provider: "google", helpKey: "gemini-2-5-flash-lite", capability: "chat", typeIcon: "📝", multimodal: true },
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash", provider: "google", helpKey: "gemini-3-flash", capability: "chat", typeIcon: "📝", description: "Топовая Flash", multimodal: true },
  { id: "gemini-3-pro-preview", name: "Gemini 3 Pro", provider: "google", helpKey: "gemini-3-pro", capability: "chat", typeIcon: "📝", multimodal: true },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", provider: "google", helpKey: "gemini-3-1-pro", capability: "chat", typeIcon: "📝", description: "Топовая модель Pro", multimodal: true },
  { id: "gemini-2.5-flash-image|text", name: "Nano Banana (текст)", provider: "google", helpKey: "nano-banana", capability: "chat", outputModality: "text", typeIcon: "📝", description: "Чат без генерации картинок", multimodal: true },
  { id: "gemini-2.5-flash-image|image", name: "Nano Banana (картинки)", provider: "google", helpKey: "nano-banana", capability: "chat", outputModality: "image", typeIcon: "🖼️", description: "Чат + генерация изображений", multimodal: true },
  { id: "gemini-3-pro-image-preview|text", name: "Nano Banana Pro (текст)", provider: "google", helpKey: "nano-banana-pro", capability: "chat", outputModality: "text", typeIcon: "📝", description: "Pro без картинок", multimodal: true },
  { id: "gemini-3-pro-image-preview|image", name: "Nano Banana Pro (картинки)", provider: "google", helpKey: "nano-banana-pro", capability: "chat", outputModality: "image", typeIcon: "🖼️", description: "Pro + генерация изображений", multimodal: true },
  { id: "gemma-3-1b", name: "Gemma 3 1B", provider: "google", helpKey: "gemma-3-1b", capability: "chat", typeIcon: "📦" },
  { id: "gemma-3-2b", name: "Gemma 3 2B", provider: "google", helpKey: "gemma-3-2b", capability: "chat", typeIcon: "📦" },
  { id: "gemma-3-4b", name: "Gemma 3 4B", provider: "google", helpKey: "gemma-3-4b", capability: "chat", typeIcon: "📦" },
  { id: "gemma-3-12b", name: "Gemma 3 12B", provider: "google", helpKey: "gemma-3-12b", capability: "chat", typeIcon: "📦" },
  { id: "gemma-3-27b", name: "Gemma 3 27B", provider: "google", helpKey: "gemma-3-27b", capability: "chat", typeIcon: "📦" },
];

/** Модели генерации изображений и видео (Imagen, Veo — отдельные API) — для справки */
export const GOOGLE_MEDIA_MODELS: AgentModelOption[] = [
  { id: "imagen-4.0-fast-generate-001", name: "Imagen 4 Fast Generate", provider: "google", helpKey: "imagen-4-fast", capability: "image", multimodal: true },
  { id: "imagen-4.0-generate-001", name: "Imagen 4 Generate", provider: "google", helpKey: "imagen-4", capability: "image", multimodal: true },
  { id: "imagen-4.0-ultra-generate-001", name: "Imagen 4 Ultra Generate", provider: "google", helpKey: "imagen-4-ultra", capability: "image", multimodal: true },
  { id: "veo-3.1-preview", name: "Veo 3 Generate", provider: "google", helpKey: "veo-3", capability: "video", multimodal: true },
  { id: "veo-3.1-fast-preview", name: "Veo 3 Fast Generate", provider: "google", helpKey: "veo-3-fast", capability: "video", multimodal: true },
];

/** Служебные и специализированные — для справки */
export const GOOGLE_OTHER_MODELS: AgentModelOption[] = [
  { id: "gemini-embedding-001", name: "Gemini Embedding 1", provider: "google", helpKey: "gemini-embedding", capability: "embedding" },
];

/** Модели для чата агента (только те, что поддерживают generateContent) */
export const GOOGLE_MODELS: AgentModelOption[] = GOOGLE_CHAT_MODELS;

/** Claude через OpenRouter. Требует AGENT_OPENROUTER_API_KEY в .env */
export const OPENROUTER_MODELS: AgentModelOption[] = [
  { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6", provider: "openrouter", typeIcon: "📝", description: "Через OpenRouter", multimodal: true },
  { id: "anthropic/claude-opus-4.5", name: "Claude Opus 4.5", provider: "openrouter", typeIcon: "📝", multimodal: true },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "openrouter", typeIcon: "📝", multimodal: true },
];

export const ALL_AGENT_MODELS: AgentModelOption[] = [...GOOGLE_CHAT_MODELS, ...OPENROUTER_MODELS];

/** Маппинг устаревших ID (без |modality) на новые. При загрузке из БД подставляем дефолт. */
const LEGACY_IMAGE_MODEL_MAP: Record<string, string> = {
  "gemini-2.5-flash-image": "gemini-2.5-flash-image|text",
  "gemini-3-pro-image-preview": "gemini-3-pro-image-preview|text",
};

/** Нормализует устаревший ID модели при чтении из БД. */
export function resolveLegacyModelId(id: string | null | undefined): string | null {
  if (!id?.trim()) return null;
  return LEGACY_IMAGE_MODEL_MAP[id.trim()] ?? id.trim();
}

export function getModelById(id: string): AgentModelOption | undefined {
  const resolved = resolveLegacyModelId(id) ?? id;
  return ALL_AGENT_MODELS.find((m) => m.id === resolved);
}

export function isOpenRouterModel(modelId: string): boolean {
  return modelId.startsWith("anthropic/") || modelId.includes("claude");
}

/** Модели с поддержкой генерации изображений (Nano Banana). */
export function isImageCapableModel(modelId: string): boolean {
  const { modelId: base } = parseModelIdWithModality(modelId);
  return /(flash-image|pro-image)/i.test(base);
}

/** Нужно ли включать responseModalities IMAGE по признаку модели (без парсинга промпта). */
export function shouldRequestImageOutput(modelId: string): boolean {
  const { outputModality } = parseModelIdWithModality(modelId);
  if (outputModality === "image") return true;
  return false;
}
