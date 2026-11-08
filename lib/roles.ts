// Ordered from lowest to highest rank.
export const ROLES = ["user", "admin", "superadmin"] as const;

export type Role = (typeof ROLES)[number];

export type Permission = "dashboard:view" | "users:manage";

export const ROLE_LABELS: Record<Role, string> = {
  user: "Usuario",
  admin: "Administrador",
  superadmin: "Superadmin",
};

export const PERMISSIONS: Record<Permission, readonly Role[]> = {
  "dashboard:view": ROLES,
  "users:manage": ["admin", "superadmin"],
};

export function parseRole(value: unknown): Role | null {
  return (ROLES as readonly unknown[]).includes(value) ? (value as Role) : null;
}

export function can(role: Role | null, permission: Permission): boolean {
  return role !== null && PERMISSIONS[permission].includes(role);
}

export function canManageRole(actor: Role, target: Role): boolean {
  return ROLES.indexOf(actor) > ROLES.indexOf(target);
}
