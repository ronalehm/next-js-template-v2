import { canManageRole, type Role } from "@/lib/roles";
import type { ClerkActivity, IdentityState, UserRow } from "../types/users.types";

export const IDENTITY_LABELS: Record<IdentityState, string> = {
  verified: "Verificada",
  not_found: "No encontrada",
  unverified: "Sin verificar",
  unlinked: "Sin vincular",
};

export function identityOf(row: Pick<UserRow, "linked">, entry: ClerkActivity[string] | undefined): IdentityState {
  if (!row.linked) return "unlinked";
  return entry?.identity ?? "unverified";
}

// RN-08: same condition that governs rowActions; the own row never qualifies (equal role).
export function canSeeIdentity(actorRole: Role, rowRole: Role): boolean {
  return canManageRole(actorRole, rowRole);
}
