/**
 * Хранилище чатов ИИ: IndexedDB (до ~4ГБ) с fallback на localStorage.
 * Чаты хранятся до ручного удаления или достижения лимита.
 */

const DB_NAME = "komiss_ai_chats";
const DB_VERSION = 1;
const STORE = "sessions";
const LEGACY_KEY = "komiss_ai_chats";

export type ChatMessageRow = { role: "user" | "assistant"; content: string; timestamp?: number };
export type AiChatMode = "chat" | "consult" | "dev";
export type AiChatSession = { id: string; title: string; messages: ChatMessageRow[]; createdAt: number; mode: AiChatMode };

export type AiChatsData = { sessions: AiChatSession[]; activeId: string | null };

function hasIndexedDB(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
  });
}

const DATA_KEY = "chats";

function normalizeSessions(rawSessions: unknown[]): AiChatSession[] {
  return rawSessions.map((s, idx) => {
    const obj = (s ?? {}) as {
      id?: unknown;
      title?: unknown;
      messages?: unknown;
      createdAt?: unknown;
      mode?: unknown;
    };
    const id =
      typeof obj.id === "string" && obj.id.trim()
        ? obj.id
        : `ai_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 9)}`;
    const title = typeof obj.title === "string" && obj.title.trim() ? obj.title : "Новый чат";
    const createdAt =
      typeof obj.createdAt === "number" && Number.isFinite(obj.createdAt)
        ? obj.createdAt
        : Date.now();
    const modeValue = obj.mode;
    const mode: AiChatMode =
      modeValue === "chat" || modeValue === "consult" || modeValue === "dev"
        ? modeValue
        : "consult";
    const rawMessages = Array.isArray(obj.messages) ? obj.messages : [];
    const messages: ChatMessageRow[] = rawMessages
      .map((m) => {
        const mm = m as { role?: unknown; content?: unknown; timestamp?: unknown };
        const role = mm.role === "assistant" ? "assistant" : "user";
        const content = typeof mm.content === "string" ? mm.content : "";
        if (!content) return null;
        const ts =
          typeof mm.timestamp === "number" && Number.isFinite(mm.timestamp)
            ? mm.timestamp
            : undefined;
        return ts != null ? { role, content, timestamp: ts } : { role, content };
      })
      .filter((m): m is ChatMessageRow => m !== null);
    return { id, title, messages, createdAt, mode };
  });
}

export async function loadAiChats(): Promise<AiChatsData | null> {
  if (!hasIndexedDB()) return loadFromLocalStorage();
  try {
    const db = await openDb();
    const raw = await new Promise<string | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(DATA_KEY);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result?.value);
    });
    db.close();
    if (!raw) return migrateFromLocalStorage();
    const data = JSON.parse(raw) as AiChatsData;
    if (!data || !Array.isArray(data.sessions)) return migrateFromLocalStorage();
    const sessions = normalizeSessions(data.sessions);
    return { sessions, activeId: data.activeId ?? null };
  } catch {
    return loadFromLocalStorage();
  }
}

function loadFromLocalStorage(): AiChatsData | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as AiChatsData;
    if (!data || !Array.isArray(data.sessions)) return null;
    const sessions = normalizeSessions(data.sessions);
    return { sessions, activeId: data.activeId ?? null };
  } catch {
    return null;
  }
}

export async function saveAiChats(data: AiChatsData): Promise<void> {
  let sessions = [...data.sessions];
  let activeId = data.activeId;

  const trySaveToIndexedDB = async (s: AiChatSession[], a: string | null) => {
    const toSave: AiChatsData = { sessions: s, activeId: a };
    const str = JSON.stringify(toSave);
    const db = await openDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.put({ key: DATA_KEY, value: str });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  };

  const saveToLocalStorage = (s: AiChatSession[], a: string | null) => {
    try {
      localStorage.setItem(LEGACY_KEY, JSON.stringify({ sessions: s, activeId: a }));
    } catch {
      /* ignore */
    }
  };

  if (!hasIndexedDB()) {
    saveToLocalStorage(sessions, activeId);
    return;
  }

  try {
    await trySaveToIndexedDB(sessions, activeId);
    clearLegacyLocalStorage();
  } catch (err) {
    const isQuota = err instanceof DOMException && (err.name === "QuotaExceededError" || err.name === "UnknownError");
    if (isQuota && sessions.length > 1) {
      sessions = [...sessions].sort((a, b) => a.createdAt - b.createdAt);
      while (sessions.length > 1) {
        sessions.shift();
        if (activeId && !sessions.some((x) => x.id === activeId)) {
          activeId = sessions[0]?.id ?? null;
        }
        try {
          await trySaveToIndexedDB(sessions, activeId);
          clearLegacyLocalStorage();
          return;
        } catch {
          /* продолжаем удалять */
        }
      }
    }
    saveToLocalStorage(sessions, activeId);
  }
}

/** Миграция из localStorage при первом запуске (IndexedDB пуст) */
export function migrateFromLocalStorage(): AiChatsData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { sessions?: unknown[]; activeId?: string | null };
    if (!Array.isArray(data.sessions) || data.sessions.length === 0) return null;
    const sessions = normalizeSessions(data.sessions);
    return { sessions, activeId: data.activeId ?? null };
  } catch {
    return null;
  }
}

function clearLegacyLocalStorage(): void {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}
