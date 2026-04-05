/** Роли каталога портала → роль profiles в Комиссионке (только user | admin). */
export function mapPortalRoleToKomissionkaProfileRole(portalRole: string): "admin" | "user" {
  const r = portalRole.trim().toLowerCase();
  if (r === "superadmin" || r === "admin") return "admin";
  return "user";
}
