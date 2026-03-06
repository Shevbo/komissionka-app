/**
 * Чтение и запись бэклога через API приложения.
 * Разрешено во всех режимах (курилка, консультация, разработка).
 */

import { getConfig } from "../config.js";

export type BacklogAction = "list" | "create" | "update" | "delete";

export interface BacklogApiResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const cfg = getConfig();
  const base = cfg.appUrl.replace(/\/$/, "");
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (cfg.apiKey) {
    headers["X-Agent-API-Key"] = cfg.apiKey;
  }
  return fetch(url, { ...options, headers });
}

/** Список записей бэклога (GET /api/admin/data → backlog). */
export async function backlogList(): Promise<BacklogApiResult> {
  try {
    const res = await adminFetch("/api/admin/data");
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status}: ${await res.text()}` };
    }
    const data = (await res.json()) as { backlog?: unknown[] };
    const list = data.backlog ?? [];
    return {
      ok: true,
      message: `Записей: ${list.length}`,
      data: list,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Ошибка запроса: ${msg}` };
  }
}

/** Создать запись (POST /api/admin/backlog). */
export async function backlogCreate(body: {
  order_num?: number | null;
  sprint_number: number;
  sprint_status: string;
  short_description: string;
  description_prompt: string;
  task_status: string;
  doc_link?: string | null;
  test_order_or_link?: string | null;
}): Promise<BacklogApiResult> {
  try {
    const res = await adminFetch("/api/admin/backlog", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok) {
      return { ok: false, message: data.error ?? `HTTP ${res.status}` };
    }
    return { ok: true, message: "Запись создана" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Ошибка: ${msg}` };
  }
}

/** Обновить запись (PATCH /api/admin/backlog/[id]). */
export async function backlogUpdate(
  id: string,
  body: Partial<{
    order_num: number | null;
    sprint_number: number;
    sprint_status: string;
    short_description: string;
    description_prompt: string;
    task_status: string;
    doc_link: string | null;
    test_order_or_link: string | null;
  }>
): Promise<BacklogApiResult> {
  try {
    const res = await adminFetch(`/api/admin/backlog/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok) {
      return { ok: false, message: data.error ?? `HTTP ${res.status}` };
    }
    return { ok: true, message: "Запись обновлена" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Ошибка: ${msg}` };
  }
}

/** Удалить запись (DELETE /api/admin/backlog/[id]). */
export async function backlogDelete(id: string): Promise<BacklogApiResult> {
  try {
    const res = await adminFetch(`/api/admin/backlog/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      return { ok: false, message: data.error ?? `HTTP ${res.status}` };
    }
    return { ok: true, message: "Запись удалена" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Ошибка: ${msg}` };
  }
}
