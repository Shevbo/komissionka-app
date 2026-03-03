/**
 * Обработка команд @agent: для извлечения исторических запросов из кэша.
 * Префикс: @agent:
 * Примеры: @agent: все темы, @agent: тема «*API*», @agent: промпт «*сбой*», @agent: экспорт (фильтр)
 */

import {
  queryCache,
  getDistinctTopics,
  type CacheEntry,
  type CacheFilter,
} from "./cache/index.js";

const PREFIX = "@agent:";

function extractQuoted(s: string): string | null {
  const m = s.match(/["«»"]([^"»"]*)["«»"]/);
  return m ? m[1]!.trim() : null;
}

function formatEntry(e: CacheEntry, index: number): string {
  const date = e.created_at instanceof Date ? e.created_at.toISOString() : String(e.created_at);
  return [
    `--- ${index + 1} ---`,
    `Дата: ${date}`,
    `Модель: ${e.llm_model ?? "—"}`,
    `Чат: ${e.chat_name ?? "—"}`,
    `Тема: ${e.topic ?? "—"}`,
    `Промпт: ${e.prompt.slice(0, 300)}${e.prompt.length > 300 ? "…" : ""}`,
    `Ответ: ${e.response.slice(0, 500)}${e.response.length > 500 ? "…" : ""}`,
  ].join("\n");
}

export interface AgentCommandResult {
  handled: boolean;
  response: string;
}

export async function tryHandleAgentCommand(
  prompt: string,
  project: string
): Promise<AgentCommandResult> {
  const trimmed = prompt.trim();
  if (!trimmed.toLowerCase().startsWith(PREFIX.toLowerCase())) {
    return { handled: false, response: "" };
  }

  const rest = trimmed.slice(PREFIX.length).trim();
  const lower = rest.toLowerCase();

  try {
    if (lower.startsWith("все темы") || lower === "все темы") {
      const topics = await getDistinctTopics(project, 200);
      if (topics.length === 0) return { handled: true, response: "Кэш пуст. Тем пока нет." };
      const batch = topics.slice(0, 20);
      let out = `Темы (${batch.length} из ${topics.length}):\n\n${batch.join("\n")}`;
      if (topics.length > 20) out += "\n\n(показаны первые 20; для следующих — повторите с y)";
      return { handled: true, response: out };
    }

    if (lower.startsWith("тема ")) {
      const pattern = extractQuoted(rest) ?? rest.replace(/^тема\s+/i, "").trim();
      const filter: CacheFilter = { project, topicPattern: pattern || undefined };
      const entries = await queryCache(filter, { limit: 20 });
      if (entries.length === 0) return { handled: true, response: `По теме «${pattern || "—"}» записей не найдено.` };
      const lines = entries.map((e, i) => formatEntry(e, i));
      return { handled: true, response: lines.join("\n\n") };
    }

    if (lower.startsWith("промпт ")) {
      const pattern = extractQuoted(rest) ?? rest.replace(/^промпт\s+/i, "").trim();
      const filter: CacheFilter = { project, promptPattern: pattern || undefined };
      const entries = await queryCache(filter, { limit: 20 });
      if (entries.length === 0) return { handled: true, response: `По промпту «${pattern || "—"}» записей не найдено.` };
      const lines = entries.map((e, i) => formatEntry(e, i));
      return { handled: true, response: lines.join("\n\n") };
    }

    if (lower.startsWith("экспорт ") || lower === "экспорт") {
      const expr = rest.replace(/^экспорт\s+/i, "").trim();
      const filter = parseExportFilter(expr, project);
      const entries = await queryCache(filter, { limit: 100 });
      if (entries.length === 0) return { handled: true, response: "По фильтру записей не найдено." };
      const csv = toCsv(entries);
      return {
        handled: true,
        response: `Экспорт (${entries.length} записей):\n\n${csv.slice(0, 50000)}${csv.length > 50000 ? "\n\n… (обрезано)" : ""}`,
      };
    }

    return {
      handled: true,
      response: [
        "Команды @agent:",
        "• @agent: все темы — список тем",
        "• @agent: тема «*API*» — промпты и ответы по теме",
        "• @agent: промпт «*сбой*» — по тексту в промпте",
        "• @agent: экспорт (проект=«X» & тема=«*y*») — экспорт в таблицу",
      ].join("\n"),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { handled: true, response: `Ошибка: ${msg}` };
  }
}

function parseExportFilter(expr: string, defaultProject: string): CacheFilter {
  const filter: CacheFilter = { project: defaultProject };
  const projectMatch = expr.match(/проект\s*=\s*["«»"]([^"»"]*)["«»"]/i);
  if (projectMatch) filter.project = projectMatch[1]!.trim();

  const topicMatch = expr.match(/тема\s*=\s*["«»"]([^"»"]*)["«»"]/i);
  if (topicMatch) filter.topicPattern = topicMatch[1]!.trim();

  const promptMatch = expr.match(/промпт\s*=\s*["«»"]([^"»"]*)["«»"]/i);
  if (promptMatch) filter.promptPattern = promptMatch[1]!.trim();

  const responseMatch = expr.match(/ответ\s*=\s*["«»"]([^"»"]*)["«»"]/i);
  if (responseMatch) filter.responsePattern = responseMatch[1]!.trim();

  return filter;
}

function toCsv(entries: CacheEntry[]): string {
  const header = "id;created_at;user;model;project;environment;mode;chat;topic;prompt;response;words_sent;words_received";
  const rows = entries.map((e) => {
    const csvCell = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    return [
      e.id,
      e.created_at instanceof Date ? e.created_at.toISOString() : e.created_at,
      e.user_account ?? "",
      e.llm_model ?? "",
      e.project,
      e.environment,
      e.mode,
      e.chat_name ?? "",
      e.topic ?? "",
      csvCell(e.prompt.slice(0, 2000)),
      csvCell(e.response.slice(0, 2000)),
      e.words_sent,
      e.words_received,
    ].join(";");
  });
  return [header, ...rows].join("\n");
}
