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
): { changeRole: boolean; revoke: boolean; activate: boolean; resend: boolean } {
  const manages = actor.id !== row.id && canManageRole(actor.role, row.role);

  return {
    changeRole: manages && actor.role === "superadmin" && row.status !== "revoked",
    revoke: manages && row.status !== "revoked",
    activate: manages && row.status === "revoked" && row.linked,
    resend: manages && row.status === "invited",
  };
}
