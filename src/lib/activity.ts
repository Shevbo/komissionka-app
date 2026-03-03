import { getOrCreateSessionId } from "komiss/lib/session-id";

export type ActivityAction =
  | "product_click"
  | "add_to_cart"
  | "REMOVE_FROM_CART"
  | "SEARCH"
  | "LOGIN"
  | "REGISTER"
  | "LOGOUT"
  | "DISCONNECT"
  | "settings_save"
  | "content_save"
  | "news_save"
  | "testimonial_save"
  | "role_change";

let lastHeartbeat = 0;
const HEARTBEAT_MS = 60_000;

function normalizeDetails(
  detailsOrEntityId?: string | Record<string, string>
): Record<string, string> {
  if (detailsOrEntityId === undefined || detailsOrEntityId === null) return {};
  if (typeof detailsOrEntityId === "string") return { entity_id: detailsOrEntityId };
  return typeof detailsOrEntityId === "object" && detailsOrEntityId !== null
    ? detailsOrEntityId
    : {};
}

export async function trackActivity(
  actionType: ActivityAction,
  detailsOrEntityId?: string | Record<string, string>
): Promise<void> {
  const details: Record<string, string> = normalizeDetails(detailsOrEntityId);
  if (typeof window !== "undefined") {
    details.session_id = getOrCreateSessionId();
  }

  const payload = {
    action_type: actionType,
    details,
    page_url: typeof window !== "undefined" ? window.location.href : undefined,
  };

  try {
    const res = await fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error("Ошибка активности:", data?.error ?? res.statusText);
    }
  } catch (e) {
    console.error("Ошибка активности:", e);
  }
}

export async function heartbeat(): Promise<void> {
  const now = Date.now();
  if (now - lastHeartbeat < HEARTBEAT_MS) return;
  lastHeartbeat = now;

  try {
    const res = await fetch("/api/activity/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      // only update lastHeartbeat on success so we retry when logged in
    }
  } catch {
    // ignore
  }
}
