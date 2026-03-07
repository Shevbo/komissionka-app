/**
 * Хранилище ожидающих подтверждений в режиме «Разработка».
 * Подтверждение — вторым сообщением пользователя («да» или любой текст); откат — сообщением «откат».
 * Таймаут 30 минут от создания (createdAt) или lastShownAt. Состояние в .agent/pending-codes.json.
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
    const data = JSON.parse(raw) as Record<string, unknown>;
    const now = Date.now();
    for (const [code, val] of Object.entries(data)) {
      const p = pendingFromSerializable(code, val);
      if (p && typeof p.createdAt === "number" && now - ttlStart(p) <= APPROVAL_TTL_MS) {
        store.set(code, p);
      }
    }
  } catch (e) {
    console.error("[approval-store] loadStore failed:", e instanceof Error ? e.message : e);
  }
}

/** Сериализует pending без циклических ссылок и не-JSON значений (чтобы запись на диск не падала молча). */
function pendingToSerializable(p: Pending): unknown {
  const base = {
    kind: p.kind,
    code: p.code,
    createdAt: p.createdAt,
    lastShownAt: (p as Pending & { lastShownAt?: number }).lastShownAt,
  };
  if (p.kind === "approval") {
    const a = p as PendingApproval;
    return {
      ...base,
      actions: a.actions,
      toolCalls: a.toolCalls,
      filesToBackup: a.filesToBackup,
      messages: (a.messages || []).map((m) => {
        if (m && typeof m === "object" && "role" in m) {
          const msg = m as Record<string, unknown>;
          return {
            role: msg.role,
            content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? ""),
            tool_calls: "tool_calls" in msg ? msg.tool_calls : undefined,
          };
        }
        return null;
      }),
    };
  }
  const v = p as PendingVerification;
  return { ...base, backupId: v.backupId, executionResult: v.executionResult };
}

/** Восстанавливает Pending из сохранённого объекта (messages — массив простых объектов). */
function pendingFromSerializable(code: string, raw: unknown): Pending | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === "approval") {
    return {
      kind: "approval",
      code,
      actions: Array.isArray(o.actions) ? o.actions : [],
      toolCalls: Array.isArray(o.toolCalls) ? o.toolCalls : [],
      messages: Array.isArray(o.messages) ? o.messages : [],
      filesToBackup: Array.isArray(o.filesToBackup) ? o.filesToBackup : [],
      createdAt: typeof o.createdAt === "number" ? o.createdAt : 0,
      lastShownAt: typeof o.lastShownAt === "number" ? o.lastShownAt : undefined,
    } as PendingApproval;
  }
  if (o.kind === "verification") {
    return {
      kind: "verification",
      code,
      backupId: typeof o.backupId === "string" ? o.backupId : "",
      executionResult: typeof o.executionResult === "string" ? o.executionResult : "",
      createdAt: typeof o.createdAt === "number" ? o.createdAt : 0,
      lastShownAt: typeof o.lastShownAt === "number" ? o.lastShownAt : undefined,
    } as PendingVerification;
  }
  return null;
}

function saveStore(): void {
  try {
    const dir = join(getConfig().root, ".agent");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const obj: Record<string, unknown> = {};
    for (const [code, p] of store.entries()) obj[code] = pendingToSerializable(p);
    writeFileSync(getPendingFilePath(), JSON.stringify(obj, null, 0), "utf8");
  } catch (e) {
    console.error("[approval-store] saveStore failed:", e instanceof Error ? e.message : e);
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

/** Фиксированные ключи: подтверждение — вторым сообщением, откат — по команде «откат». */
export const PENDING_APPROVAL_KEY = "confirm";
export const PENDING_VERIFICATION_KEY = "verify";

/** Сохраняет ожидание подтверждения (в память и в файл). При создании lastShownAt = now. */
export function setPending(code: string, pending: Pending): void {
  ensureLoaded();
  cleanupExpired();
  const now = Date.now();
  (pending as Pending & { lastShownAt?: number }).lastShownAt = now;
  store.set(code, pending);
  saveStore();
}

/** Обновляет момент последнего показа (для TTL). Подтверждение — вторым сообщением, не кодом. */
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

/** Получает и удаляет единственный pending подтверждения (второе сообщение = подтверждение). */
export function getAndConsumePendingApproval(): ConsumeResult | undefined {
  return consumePending(PENDING_APPROVAL_KEY);
}

/** Получает и удаляет единственный pending верификации (для отката по команде «откат»). */
export function getAndConsumePendingVerification(): ConsumeResult | undefined {
  return consumePending(PENDING_VERIFICATION_KEY);
}
