/**
 * Хранилище чатов ИИ: IndexedDB (до ~4ГБ) с fallback на localStorage.
 * Отдельная серия чатов в каждом режиме (chat / consult / dev), хранятся до ручного удаления.
 */

const DB_NAME = "komiss_ai_chats";
const DB_VERSION = 1;
const STORE = "sessions";
const LEGACY_KEY = "komiss_ai_chats";

const MODES: AiChatMode[] = ["chat", "consult", "dev"];
function modeKey(mode: AiChatMode): string {
  return `chats_${mode}`;
}

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

/** Загружает все чаты; activeId возвращается для указанного режима. */
export async function loadAiChats(currentMode: AiChatMode): Promise<AiChatsData | null> {
  if (!hasIndexedDB()) return loadFromLocalStorage(currentMode);
  try {
    const db = await openDb();
    const loadKey = (key: string) =>
      new Promise<string | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(key);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result?.value);
      });

    const legacyRaw = await loadKey("chats");
    if (legacyRaw) {
      const migrated = migrateFromLegacySingle(legacyRaw, currentMode);
      if (migrated) {
        await saveAiChats(migrated);
        const delTx = db.transaction(STORE, "readwrite");
        delTx.objectStore(STORE).delete("chats");
        await new Promise<void>((res, rej) => {
          delTx.oncomplete = () => res();
          delTx.onerror = () => rej(delTx.error);
        });
      }
      db.close();
      return migrated;
    }

    const raws = await Promise.all(MODES.map((m) => loadKey(modeKey(m))));
    db.close();

    const parts: { sessions: AiChatSession[]; activeId: string | null }[] = raws.map((raw, i) => {
      if (!raw) return { sessions: [], activeId: null };
      try {
        const data = JSON.parse(raw) as AiChatsData;
        const sessions = Array.isArray(data.sessions) ? normalizeSessions(data.sessions) : [];
        const activeId = data.activeId ?? null;
        return { sessions, activeId };
      } catch {
        return { sessions: [], activeId: null };
      }
    });

    const sessions = parts.flatMap((p) => p.sessions);
    const activeId = parts[MODES.indexOf(currentMode)]?.activeId ?? null;
    if (sessions.length === 0) return loadFromLocalStorage(currentMode);
    return { sessions, activeId };
  } catch {
    return loadFromLocalStorage(currentMode);
  }
}

function loadFromLocalStorage(currentMode: AiChatMode): AiChatsData | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as AiChatsData;
    if (!data || !Array.isArray(data.sessions)) return null;
    const sessions = normalizeSessions(data.sessions);
    const activeId = data.activeId ?? null;
    return { sessions, activeId };
  } catch {
    return null;
  }
}

function migrateFromLegacySingle(legacyRaw: string, currentMode: AiChatMode): AiChatsData | null {
  try {
    const data = JSON.parse(legacyRaw) as AiChatsData;
    if (!data || !Array.isArray(data.sessions)) return null;
    const sessions = normalizeSessions(data.sessions);
    const activeId = data.activeId ?? null;
    return { sessions, activeId };
  } catch {
    return null;
  }
}

export async function saveAiChats(data: AiChatsData): Promise<void> {
  const sessions = [...data.sessions];
  const activeSession = data.activeId ? sessions.find((s) => s.id === data.activeId) : null;

  const byMode = (m: AiChatMode) => sessions.filter((s) => s.mode === m);
  const activeIdForMode = (m: AiChatMode): string | null => {
    if (activeSession?.mode === m) return data.activeId;
    const first = sessions.find((s) => s.mode === m);
    return first?.id ?? null;
  };

  const trySaveToIndexedDB = async () => {
    const db = await openDb();
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    await Promise.all(
      MODES.map((m) => {
        const part: AiChatsData = { sessions: byMode(m), activeId: activeIdForMode(m) };
        return new Promise<void>((resolve, reject) => {
          const req = store.put({ key: modeKey(m), value: JSON.stringify(part) });
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      })
    );
    db.close();
  };

  const saveToLocalStorageFallback = () => {
    try {
      localStorage.setItem(LEGACY_KEY, JSON.stringify({ sessions, activeId: data.activeId }));
    } catch {
      /* ignore */
    }
  };

  if (!hasIndexedDB()) {
    saveToLocalStorageFallback();
    return;
  }

  try {
    await trySaveToIndexedDB();
  } catch {
    saveToLocalStorageFallback();
  }
}

/** Миграция из старого одного ключа (localStorage) при первом запуске */
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
