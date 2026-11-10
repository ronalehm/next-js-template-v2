import { canManageRole, ROLES, type Role } from "@/lib/roles";
import type { UserRow } from "../types/users.types";

// D37: the roles an actor manages are the ones it can assign (never superadmin, D4).
export function assignableRoles(actorRole: Role): Role[] {
  return ROLES.filter((role) => canManageRole(actorRole, role));
}

// R40, D37. Only hides options in the UI; the service repeats every check (R47).
export function rowActions(
  actor: { id: string; role: Role },
  row: Pick<UserRow, "id" | "role" | "status" | "linked">,
): { edit: boolean; revoke: boolean; activate: boolean; resend: boolean; remove: boolean; recover: boolean } {
  const manages = actor.id !== row.id && canManageRole(actor.role, row.role);

  return {
    // Active linked rows: name and role. Invited rows (superadmin only): role only (RN-08).
    edit: manages && ((row.status === "active" && row.linked) || (row.status === "invited" && actor.role === "superadmin")),
    revoke: manages && row.status !== "revoked",
    activate: manages && row.status === "revoked" && row.linked,
    resend: manages && row.status === "invited",
    // Hard delete: superadmin only, never itself or another superadmin (RN-01, RN-02).
    remove: actor.role === "superadmin" && manages && row.role !== "superadmin",
    // Recover access (RN-01): active linked rows, never a superadmin row. Pure: no Clerk lookup (RN-10).
    recover: manages && row.status === "active" && row.linked && row.role !== "superadmin",
  };
}
