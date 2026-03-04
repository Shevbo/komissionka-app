/**
 * Хранилище ожидающих подтверждений в режиме «Разработка».
 * Защита от случайного выполнения: 4-значный код, таймаут 30 минут.
 * Таймаут считается от последнего показа кода пользователю (lastShownAt), а не от создания:
 * если пользователь уточняет план в диалоге, каждый новый пост модели с «Подтвердите кодом: XXXX»
 * сдвигает отсчёт, чтобы 30 минут были на согласование после последней просьбы ввести код.
 * Состояние сохраняется в .agent/pending-codes.json (коды переживают перезапуск агента).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getConfig } from "./config.js";

export type PendingKind = "approval" | "verification";

export interface PendingApproval {
  kind: "approval";
  code: string;
  /** Список действий для показа администратору */
  actions: string[];
  /** Tool calls от модели (для выполнения после подтверждения) */
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  /** Сообщения для продолжения LLM-цикла после выполнения */
  messages: unknown[];
  /** Пути файлов для бэкапа (из write_file) */
  filesToBackup: string[];
  createdAt: number;
  /** Когда в последний раз показывали код пользователю (от этого момента считается TTL). */
  lastShownAt?: number;
}

export interface PendingVerification {
  kind: "verification";
  code: string;
  /** Может быть пустым, если backup не удался */
  backupId: string;
  /** Результат выполнения для отчёта */
  executionResult: string;
  createdAt: number;
  /** Когда в последний раз показывали код пользователю (от этого момента считается TTL). */
  lastShownAt?: number;
}

export type Pending = PendingApproval | PendingVerification;

/** Момент, от которого считается TTL: последний показ кода или создание. */
function ttlStart(p: Pending): number {
  return p.lastShownAt ?? p.createdAt;
}

const store = new Map<string, Pending>();

/** 30 минут — чтобы код оставался действительным при перезапуске агента (деплой) или долгом чтении плана. */
const APPROVAL_TTL_MS = 30 * 60 * 1000;

let loadedFromDisk = false;

function getPendingFilePath(): string {
  return join(getConfig().root, ".agent", "pending-codes.json");
}

function loadStore(): void {
  loadedFromDisk = true;
  const path = getPendingFilePath();
  if (!existsSync(path)) return;
  try {
    const raw = readFileSync(path, "utf8");
    const data = JSON.parse(raw) as Record<string, Pending>;
    const now = Date.now();
    for (const [code, p] of Object.entries(data)) {
      if (p && typeof p.createdAt === "number" && now - ttlStart(p) <= APPROVAL_TTL_MS) {
        store.set(code, p);
      }
    }
  } catch {
    /* файл повреждён или пустой — работаем с пустым store */
  }
}

function saveStore(): void {
  try {
    const dir = join(getConfig().root, ".agent");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const obj: Record<string, Pending> = {};
    for (const [code, p] of store.entries()) obj[code] = p;
    writeFileSync(getPendingFilePath(), JSON.stringify(obj, null, 0), "utf8");
  } catch {
    /* не удалось записать — храним только в памяти */
  }
}

function ensureLoaded(): void {
  if (!loadedFromDisk) loadStore();
}

function cleanupExpired(): void {
  const now = Date.now();
  let changed = false;
  for (const [code, p] of store.entries()) {
    if (now - ttlStart(p) > APPROVAL_TTL_MS) {
      store.delete(code);
      changed = true;
    }
  }
  if (changed) saveStore();
}

/** Генерирует 4-значный код (1000–9999). */
export function generateCode(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}

/** Сохраняет ожидание подтверждения (в память и в файл). При создании lastShownAt = now. */
export function setPending(code: string, pending: Pending): void {
  ensureLoaded();
  cleanupExpired();
  const now = Date.now();
  (pending as Pending & { lastShownAt?: number }).lastShownAt = now;
  store.set(code, pending);
  saveStore();
}

/** Обновляет момент последнего показа кода (ответ модели с «Подтвердите кодом: XXXX»). TTL считается от него. */
export function refreshPendingShown(code: string): void {
  ensureLoaded();
  const p = store.get(code);
  if (!p) return;
  (p as Pending & { lastShownAt?: number }).lastShownAt = Date.now();
  saveStore();
}

export interface ConsumeResult {
  pending: Pending;
  expired: boolean;
}

/** Получает и удаляет pending по коду. Возвращает undefined, если не найден. При истечении — всё равно возвращает данные (expired: true) для отката. */
export function consumePending(code: string): ConsumeResult | undefined {
  ensureLoaded();
  cleanupExpired();
  const p = store.get(code);
  if (!p) return undefined;
  const expired = Date.now() - ttlStart(p) > APPROVAL_TTL_MS;
  store.delete(code);
  saveStore();
  return { pending: p, expired };
}

/** Проверяет, есть ли pending с данным кодом (без удаления). */
export function hasPending(code: string): boolean {
  ensureLoaded();
  cleanupExpired();
  const p = store.get(code);
  if (!p) return false;
  if (Date.now() - ttlStart(p) > APPROVAL_TTL_MS) {
    store.delete(code);
    saveStore();
    return false;
  }
  return true;
}
