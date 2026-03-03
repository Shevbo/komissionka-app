/**
 * Функция оценки сходства двух текстов (возвращает 0–100%).
 * Использует нормализацию слов и подсчёт пересечения (Jaccard + word overlap).
 */

function normalizeForCompare(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/** Возвращает процент совпадения (0–100). */
export function textSimilarity(a: string, b: string): number {
  if (!a.trim() && !b.trim()) return 100;
  if (!a.trim() || !b.trim()) return 0;

  const setA = new Set(normalizeForCompare(a));
  const setB = new Set(normalizeForCompare(b));
  if (setA.size === 0 && setB.size === 0) return 100;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  const jaccard = union > 0 ? intersection / union : 0;
  const overlap = Math.min(setA.size, setB.size) > 0 ? intersection / Math.min(setA.size, setB.size) : 0;
  const score = (jaccard * 0.4 + overlap * 0.6) * 100;
  return Math.min(100, Math.round(score * 100) / 100);
}
