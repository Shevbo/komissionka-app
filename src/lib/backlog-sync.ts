/**
 * Синхронизация таблицы backlog в docs/backlog.md для учёта (дубликат для администратора и ИИ).
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

export type BacklogRow = {
  id: string;
  order_num: number | null;
  sprint_number: number;
  sprint_status: string;
  short_description: string;
  description_prompt: string;
  task_status: string;
  task_type?: string | null;
  modules?: string | null;
  components?: string | null;
  complexity?: number | null;
  prompt_model?: string | null;
  prompt_created_at?: string | null;
  prompt_duration_sec?: number | null;
  prompt_log_id?: string | null;
  prompt_about?: string | null;
  doc_link: string | null;
  test_order_or_link: string | null;
  created_at: string | null;
  status_changed_at: string | null;
};

function escapeCell(s: string): string {
  return s.replace(/\r/g, "").replace(/\n/g, " ").replace(/\|/g, "\\|");
}

function resolveProjectRoot(startDir: string): string {
  let dir = startDir;
  // Ищем package.json вверх по дереву (ограничимся несколькими уровнями, чтобы не выйти за пределы проекта)
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(dir, "package.json"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

/** Формирует Markdown-таблицу бэклога и записывает в docs/backlog.md */
export function syncBacklogToDoc(rows: BacklogRow[], cwd: string | undefined): void {
  const rootDir = resolveProjectRoot(cwd ?? process.cwd());
  const header = [
    "№",
    "Спринт",
    "Статус спринта",
    "Краткое описание",
    "Описание/промпт для ИИ",
    "Тип задачи",
    "Модули",
    "Компоненты",
    "Сложность",
    "Статус задачи",
    "Документация",
    "Тестирование",
    "Создано",
    "Изменено",
  ];
  const lines: string[] = [
    "# Бэклог",
    "",
    "Дубликат таблицы backlog в БД для учёта хотелок и статусов. Версия: " +
      new Date().toISOString().slice(0, 19).replace("T", " "),
    "",
    "| " + header.join(" | ") + " |",
    "| " + header.map(() => "---").join(" | ") + " |",
  ];
  rows.forEach((r, i) => {
    const promptPreview =
      r.description_prompt.length > 120
        ? escapeCell(r.description_prompt.slice(0, 120) + "…")
        : escapeCell(r.description_prompt);
    const testPreview =
      r.test_order_or_link && r.test_order_or_link.length > 80
        ? escapeCell(r.test_order_or_link.slice(0, 80) + "…")
        : (r.test_order_or_link ? escapeCell(r.test_order_or_link) : "—");
    lines.push(
      "| " +
        [
          r.order_num ?? i + 1,
          r.sprint_number,
          r.sprint_status,
          escapeCell(r.short_description.slice(0, 80)) + (r.short_description.length > 80 ? "…" : ""),
          promptPreview,
          r.task_type ?? "—",
          r.modules ?? "—",
          r.components ?? "—",
          r.complexity != null ? String(r.complexity) : "—",
          r.task_status,
          r.doc_link ?? "—",
          testPreview,
          r.created_at ? r.created_at.slice(0, 19).replace("T", " ") : "—",
          r.status_changed_at ? r.status_changed_at.slice(0, 19).replace("T", " ") : "—",
        ].join(" | ") +
        " |"
    );
  });
  const content = lines.join("\n") + "\n";
  const docsDir = join(rootDir, "docs");
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(join(docsDir, "backlog.md"), content, "utf8");
}
