/**
 * Подписи режимов агента. Режим «разработка» — с ярким предупреждением.
 */

export const DEV_MODE_WARNING = "⚠️ ВНИМАНИЕ! Прямой доступ к коду";

export const MODE_LABELS: Record<string, string> = {
  chat: "Курилка",
  consult: "Консультация",
  dev: "Разработка",
};

/** Подпись режима (для dev — с предупреждением о прямом доступе к коду). */
export function getModeLabel(mode: string): string {
  if (mode === "dev") return `⚠️ ${MODE_LABELS.dev} — ${DEV_MODE_WARNING}`;
  return MODE_LABELS[mode] ?? mode;
}

/** Краткая подпись для кнопки (режим разработка с восклицательным знаком). */
export function getModeButtonLabel(mode: string): string {
  if (mode === "dev") return "⚠️ Разработка!";
  return MODE_LABELS[mode] ?? mode;
}
