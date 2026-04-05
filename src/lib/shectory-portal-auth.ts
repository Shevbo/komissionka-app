export type PortalVerifyOk = {
  email: string;
  role: string;
  fullName: string;
};

/**
 * Проверка email/пароля через API портала Shectory (portal_users).
 * Нужны одинаковые SHECTORY_AUTH_BRIDGE_SECRET на портале и в этом приложении.
 */
export async function verifyShectoryPortalCredentials(
  email: string,
  password: string
): Promise<PortalVerifyOk | null> {
  const secret = process.env.SHECTORY_AUTH_BRIDGE_SECRET?.trim();
  const base = (process.env.SHECTORY_PORTAL_URL ?? "https://shectory.ru").replace(/\/$/, "");
  if (!secret) return null;

  const emailNorm = email.trim().toLowerCase();

  try {
    const r = await fetch(`${base}/api/internal/verify-portal-credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ email: emailNorm, password }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      ok?: boolean;
      email?: string;
      role?: string;
      fullName?: string;
    };
    if (!j.ok || !j.email) return null;
    return {
      email: j.email,
      role: j.role ?? "user",
      fullName: typeof j.fullName === "string" ? j.fullName : "",
    };
  } catch {
    return null;
  }
}
