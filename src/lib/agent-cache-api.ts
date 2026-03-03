/**
 * API для работы с кэшем промптов агента (для админки).
 */

import { prisma } from "komiss/lib/prisma";

function patternToRegex(p: string): RegExp {
  const parts = p.split("*");
  const escaped = parts.map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(escaped.join(".*"), "i");
}

export interface CacheQueryFilter {
  project?: string;
  topic?: string;
  topicPattern?: string;
  promptPattern?: string;
  responsePattern?: string;
}

export async function queryAgentCache(
  filter: CacheQueryFilter,
  options?: { limit?: number; offset?: number }
) {
  const limit = Math.min(options?.limit ?? 20, 100);
  const offset = options?.offset ?? 0;

  const where: Record<string, unknown> = {};
  if (filter.project) where.project = filter.project;
  const hasMemoryFilter = !!(filter.topic || filter.topicPattern || filter.promptPattern || filter.responsePattern);

  let rows = await prisma.agent_prompt_cache.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    orderBy: { created_at: "desc" },
    skip: hasMemoryFilter ? 0 : offset,
    take: hasMemoryFilter ? 1000 : limit + offset,
  });

  if (filter.topic) {
    const t = filter.topic.toLowerCase();
    rows = rows.filter((r) => r.topic?.toLowerCase().includes(t));
  }
  if (filter.topicPattern) {
    const re = patternToRegex(filter.topicPattern);
    rows = rows.filter((r) => r.topic && re.test(r.topic));
  }
  if (filter.promptPattern) {
    const re = patternToRegex(filter.promptPattern);
    rows = rows.filter((r) => re.test(r.prompt));
  }
  if (filter.responsePattern) {
    const re = patternToRegex(filter.responsePattern);
    rows = rows.filter((r) => re.test(r.response));
  }

  return hasMemoryFilter ? rows.slice(offset, offset + limit) : rows;
}

export async function getAgentCacheSize() {
  const rows = await prisma.agent_prompt_cache.findMany({
    select: { prompt: true, response: true, file_links: true },
  });
  let total = 0;
  for (const r of rows) {
    total += Buffer.byteLength(r.prompt, "utf-8") + Buffer.byteLength(r.response, "utf-8");
    total += r.file_links.reduce((s, l) => s + Buffer.byteLength(l, "utf-8"), 0);
  }
  return total;
}

export function toCsvExport(rows: Awaited<ReturnType<typeof queryAgentCache>>): string {
  const header =
    "id;created_at;user;model;project;environment;mode;chat;topic;prompt;response;words_sent;words_received";
  const csvCell = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const data = rows.map((e) =>
    [
      e.id,
      e.created_at.toISOString(),
      e.user_account ?? "",
      e.llm_model ?? "",
      e.project,
      e.environment,
      e.mode,
      e.chat_name ?? "",
      e.topic ?? "",
      csvCell(e.prompt.slice(0, 5000)),
      csvCell(e.response.slice(0, 5000)),
      e.words_sent,
      e.words_received,
    ].join(";")
  );
  return [header, ...data].join("\n");
}
