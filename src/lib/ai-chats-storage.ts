/**
 * Хранилище чатов ИИ: IndexedDB (до ~4ГБ) с fallback на localStorage.
 * Чаты хранятся до ручного удаления или достижения лимита.
 */

const DB_NAME = "komiss_ai_chats";
const DB_VERSION = 1;
const STORE = "sessions";
const LEGACY_KEY = "komiss_ai_chats";

export type ChatMessageRow = { role: "user" | "assistant"; content: string; timestamp?: number };
export type AiChatSession = { id: string; title: string; messages: ChatMessageRow[]; createdAt: number };

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
    return data;
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
    return data;
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
    const data = JSON.parse(raw) as { sessions?: AiChatSession[]; activeId?: string | null };
    if (!Array.isArray(data.sessions) || data.sessions.length === 0) return null;
    return { sessions: data.sessions, activeId: data.activeId ?? null };
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
