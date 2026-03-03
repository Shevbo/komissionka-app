/**
 * Хранилище ожидающих подтверждений в режиме «Разработка».
 * Защита от случайного выполнения: 4-значный код, таймаут 15 минут.
 */

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
}

export interface PendingVerification {
  kind: "verification";
  code: string;
  /** Может быть пустым, если backup не удался */
  backupId: string;
  /** Результат выполнения для отчёта */
  executionResult: string;
  createdAt: number;
}

export type Pending = PendingApproval | PendingVerification;

const store = new Map<string, Pending>();

const APPROVAL_TTL_MS = 15 * 60 * 1000; // 15 минут

function cleanupExpired(): void {
  const now = Date.now();
  for (const [code, p] of store.entries()) {
    if (now - p.createdAt > APPROVAL_TTL_MS) {
      store.delete(code);
    }
  }
}

/** Генерирует 4-значный код (1000–9999). */
export function generateCode(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}

/** Сохраняет ожидание подтверждения. */
export function setPending(code: string, pending: Pending): void {
  cleanupExpired();
  store.set(code, pending);
}

export interface ConsumeResult {
  pending: Pending;
  expired: boolean;
}

/** Получает и удаляет pending по коду. Возвращает undefined, если не найден. При истечении — всё равно возвращает данные (expired: true) для отката. */
export function consumePending(code: string): ConsumeResult | undefined {
  cleanupExpired();
  const p = store.get(code);
  if (!p) return undefined;
  const expired = Date.now() - p.createdAt > APPROVAL_TTL_MS;
  store.delete(code);
  return { pending: p, expired };
}

/** Проверяет, есть ли pending с данным кодом (без удаления). */
export function hasPending(code: string): boolean {
  cleanupExpired();
  const p = store.get(code);
  if (!p) return false;
  if (Date.now() - p.createdAt > APPROVAL_TTL_MS) {
    store.delete(code);
    return false;
  }
  return true;
}
