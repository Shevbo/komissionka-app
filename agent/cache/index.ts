/**
 * Кэш промптов и ответов агента.
 * Хранит запросы/ответы в PostgreSQL, проверяет сходство перед вызовом LLM.
 * Prisma 7 требует adapter или accelerateUrl; используем pg adapter как в src/lib/prisma.ts.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { textSimilarity } from "./similarity.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Agent cache requires it for PostgreSQL.");
}
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);

export interface CacheEntry {
  id: string;
  created_at: Date;
  user_account: string | null;
  llm_model: string | null;
  history_turns: number;
  project: string;
  environment: string;
  mode: string;
  chat_name: string | null;
  topic: string | null;
  prompt: string;
  response: string;
  file_links: string[];
  words_sent: number;
  words_received: number;
}

export interface CacheMetadata {
  project: string;
  userAccount?: string | null;
  llmModel?: string | null;
  historyTurns: number;
  environment: string;
  mode: string;
  chatName?: string | null;
}

export interface FindSimilarResult {
  entry: CacheEntry;
  similarity: number;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return prisma;
}

/** Находит похожие записи в кэше (similarity >= threshold). */
export async function findSimilar(
  prompt: string,
  metadata: CacheMetadata,
  threshold: number
): Promise<FindSimilarResult[]> {
  const db = getPrisma();
  const candidates = await db.agent_prompt_cache.findMany({
    where: {
      project: metadata.project,
      mode: metadata.mode,
      ...(metadata.userAccount ? { user_account: metadata.userAccount } : {}),
      ...(metadata.llmModel ? { llm_model: metadata.llmModel } : {}),
    },
    orderBy: { created_at: "desc" },
    take: 200,
  });

  const results: FindSimilarResult[] = [];
  for (const row of candidates) {
    const sim = textSimilarity(prompt, row.prompt);
    if (sim >= threshold) {
      results.push({
        entry: {
          id: row.id,
          created_at: row.created_at,
          user_account: row.user_account,
          llm_model: row.llm_model,
          history_turns: row.history_turns,
          project: row.project,
          environment: row.environment,
          mode: row.mode,
          chat_name: row.chat_name,
          topic: row.topic,
          prompt: row.prompt,
          response: row.response,
          file_links: row.file_links,
          words_sent: row.words_sent,
          words_received: row.words_received,
        },
        similarity: sim,
      });
    }
  }
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, 5);
}

/** Сохраняет запись в кэш. */
export async function saveToCache(
  metadata: CacheMetadata,
  prompt: string,
  response: string,
  options?: { topic?: string; fileLinks?: string[]; wordsSent?: number; wordsReceived?: number; systemPromptLen?: number }
): Promise<void> {
  const db = getPrisma();
  const hash = simpleHash(prompt).slice(0, 64);
  await db.agent_prompt_cache.create({
    data: {
      user_account: metadata.userAccount ?? null,
      llm_model: metadata.llmModel ?? null,
      history_turns: metadata.historyTurns,
      project: metadata.project,
      environment: metadata.environment,
      mode: metadata.mode,
      chat_name: metadata.chatName ?? null,
      topic: options?.topic ?? null,
      prompt,
      response,
      file_links: options?.fileLinks ?? [],
      words_sent: options?.wordsSent ?? countWords(prompt),
      words_received: options?.wordsReceived ?? countWords(response),
      prompt_hash: hash,
      system_prompt_len: options?.systemPromptLen ?? 0,
    },
  });
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16) + s.length.toString(16);
}

/** Подсчёт размера кэша (приблизительно в байтах). */
export async function getCacheSizeBytes(): Promise<number> {
  const db = getPrisma();
  const rows = await db.agent_prompt_cache.findMany({ select: { prompt: true, response: true, file_links: true } });
  let total = 0;
  for (const r of rows) {
    total += Buffer.byteLength(r.prompt, "utf-8") + Buffer.byteLength(r.response, "utf-8");
    total += r.file_links.reduce((s, l) => s + Buffer.byteLength(l, "utf-8"), 0);
  }
  return total;
}

/** Удаляет старые записи, пока размер не станет < maxBytes. */
export async function trimCacheIfNeeded(maxBytes: number): Promise<number> {
  let size = await getCacheSizeBytes();
  if (size <= maxBytes) return 0;

  const db = getPrisma();
  const toDelete = await db.agent_prompt_cache.findMany({
    orderBy: { created_at: "asc" },
    select: { id: true, prompt: true, response: true, file_links: true },
  });

  let deleted = 0;
  for (const row of toDelete) {
    if (size <= maxBytes) break;
    await db.agent_prompt_cache.delete({ where: { id: row.id } });
    const rowSize =
      Buffer.byteLength(row.prompt, "utf-8") +
      Buffer.byteLength(row.response, "utf-8") +
      row.file_links.reduce((s, l) => s + Buffer.byteLength(l, "utf-8"), 0);
    size -= rowSize;
    deleted++;
  }
  return deleted;
}

/** Фильтр для запросов кэша (парсинг из @agent: команды). */
export interface CacheFilter {
  project?: string;
  topic?: string;
  topicPattern?: string;
  promptPattern?: string;
  responsePattern?: string;
}

/** Преобразует паттерн вида *API* в regex. */
function patternToRegex(p: string): RegExp {
  const parts = p.split("*");
  const escaped = parts.map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(escaped.join(".*"), "i");
}

/** Запрос кэша с фильтрами и пагинацией. */
export async function queryCache(
  filter: CacheFilter,
  options?: { limit?: number; offset?: number }
): Promise<CacheEntry[]> {
  const db = getPrisma();
  const limit = Math.min(options?.limit ?? 20, 100);
  const offset = options?.offset ?? 0;

  const where: Record<string, unknown> = {};
  if (filter.project) where.project = filter.project;

  let rows = await db.agent_prompt_cache.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    orderBy: { created_at: "desc" },
    skip: offset,
    take: Math.min(500, (limit + 1) * 3),
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

  return rows.slice(0, limit).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    user_account: r.user_account,
    llm_model: r.llm_model,
    history_turns: r.history_turns,
    project: r.project,
    environment: r.environment,
    mode: r.mode,
    chat_name: r.chat_name,
    topic: r.topic,
    prompt: r.prompt,
    response: r.response,
    file_links: r.file_links,
    words_sent: r.words_sent,
    words_received: r.words_received,
  }));
}

/** Уникальные темы (для @agent: все темы). */
export async function getDistinctTopics(project?: string, limit = 100): Promise<string[]> {
  const db = getPrisma();
  const rows = await db.agent_prompt_cache.findMany({
    where: project ? { project } : undefined,
    select: { topic: true },
    distinct: ["topic"],
    orderBy: { created_at: "desc" },
    take: limit,
  });
  return rows.map((r) => r.topic ?? "(без темы)").filter(Boolean);
}
