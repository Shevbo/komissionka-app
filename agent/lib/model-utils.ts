/**
 * Утилиты для парсинга modelId с признаком outputModality.
 * Дублирование логики из src/lib/agent-models для независимости агента.
 */

export type OutputModality = "text" | "image" | "video" | "live";

const MODEL_MODALITY_SEP = "|";

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

/** Нужно ли включать responseModalities IMAGE по признаку модели. */
export function shouldRequestImageOutput(modelId: string): boolean {
  const { outputModality } = parseModelIdWithModality(modelId);
  return outputModality === "image";
}

/** Модель OpenRouter (Claude и т.п.) — те же правила, что в src/lib/agent-models.ts. */
export function isOpenRouterModelId(modelId: string): boolean {
  const id = modelId.trim();
  return id.startsWith("anthropic/") || id.includes("claude");
}
