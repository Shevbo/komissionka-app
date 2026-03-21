/**
 * Обязательный подвал любого отчёта модели.
 * Включает: версия модели, проект, режим, кол-во символов/слов, версии приложений до/после.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface ReportFooterParams {
  /** Отображаемое имя модели (например "Gemini 3 Pro"). */
  model: string;
  /** Проект (например "Комиссионка"). */
  project: string;
  /** Режим: chat, consult, dev. */
  mode: "chat" | "consult" | "dev";
  /** Символов во вводе (промпт + история + системный промпт). */
  inputChars: number;
  /** Символов в выводе (ответ модели). */
  outputChars: number;
  /** Слов во вводе. */
  inputWords: number;
  /** Слов в выводе. */
  outputWords: number;
  /** Корень проекта (для чтения version.json). */
  root: string;
  /** Версии на старте запроса. */
  versionsBefore: { app: string; agent: string; tgbot: string };
  /** Версии на момент завершения (если были изменения — перечитать с диска). */
  versionsAfter?: { app: string; agent: string; tgbot: string };
  /** Были ли внесены изменения в репозиторий (write_file, run_command). */
  hadModifications?: boolean;
  /** Статус служб: запущены ли app, agent, bot. */
  servicesStatus?: { app: boolean; agent: boolean; bot: boolean };
}

function countWords(s: string): number {
  return s.split(/\s+/).filter((w) => w.length > 0).length;
}

function readVersions(root: string): { app: string; agent: string; tgbot: string } {
  const path = join(root, "version.json");
  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, "utf-8");
      const data = JSON.parse(raw) as { app?: string; agent?: string; tgbot?: string };
      return {
        app: data.app ?? "1.0.0",
        agent: data.agent ?? "1.0.0",
        tgbot: data.tgbot ?? "1.0.0",
      };
    } catch {
      // fallthrough
    }
  }
  return { app: "1.0.0", agent: "1.0.0", tgbot: "1.0.0" };
}

export { readVersions };

/** Строит строку подвала отчёта. */
export function buildReportFooter(p: ReportFooterParams): string {
  const modeLabel = p.mode === "chat" ? "курилка" : p.mode === "consult" ? "консультация" : "разработка";
  const vb = p.versionsBefore;
  const va = p.versionsAfter ?? vb;
  const versionsLine = p.hadModifications
    ? `Версии до: app v${vb.app}, agent v${vb.agent}, tgbot v${vb.tgbot}; после: app v${va.app}, agent v${va.agent}, tgbot v${va.tgbot}`
    : `Версии: app v${vb.app}, agent v${vb.agent}, tgbot v${vb.tgbot}`;

  const servicesLine = p.servicesStatus
    ? `Службы: app ${p.servicesStatus.app ? "✓" : "—"}, agent ${p.servicesStatus.agent ? "✓" : "—"}, bot ${p.servicesStatus.bot ? "✓" : "—"}`
    : "";

  return (
    "\n\n---\n" +
    `Модель: ${p.model} | Проект: ${p.project} | Режим: ${modeLabel}\n` +
    `Символов: ввод ${p.inputChars} / вывод ${p.outputChars} (слов: ${p.inputWords} / ${p.outputWords})\n` +
    versionsLine +
    (servicesLine ? `\n${servicesLine}` : "")
  );
}

/** Подсчёт символов и слов для подвала. */
export function countChars(s: string): number {
  return s.length;
}

export { countWords as countWordsForFooter };

/**
 * Убирает подвал отчёта из текста ассистента перед повторной подачей в LLM (многоходовый чат).
 * Иначе во «втором» запросе в contents попадают тысячи символов метрик/версий вместо сути ответа и уточнений.
 */
export function stripAgentReportFooter(text: string): string {
  const marker = "\n\n---\nМодель:";
  const idx = text.indexOf(marker);
  if (idx >= 0) return text.slice(0, idx).trimEnd();
  return text;
}
