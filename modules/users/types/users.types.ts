import type { z } from "zod";
import type { Role } from "@/lib/roles";
import type {
  editUserInputSchema,
  idInputSchema,
  inviteInputSchema,
  nameInputSchema,
  roleInputSchema,
  SORT_KEYS,
  USER_STATUSES,
  usersQuerySchema,
} from "../schemas/users.schema";

export type UserStatus = (typeof USER_STATUSES)[number];
export type SortKey = (typeof SORT_KEYS)[number];
export type UsersQuery = z.output<typeof usersQuerySchema>;

export type InviteInput = z.output<typeof inviteInputSchema>;
export type RoleInput = z.output<typeof roleInputSchema>;
export type IdInput = z.output<typeof idInputSchema>;
export type NameInput = z.output<typeof nameInputSchema>;
export type EditUserInput = z.output<typeof editUserInputSchema>;

// Never carries a Clerk id (D38).
export type UserRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  status: UserStatus;
  linked: boolean;
  createdAt: string;
};

export type UsersPage = { rows: UserRow[]; total: number; page: number; pageCount: number };

export type IdentityState = "verified" | "not_found" | "unverified" | "unlinked";

// Keyed by the app_users row id. Only linked rows have an entry; `unlinked` is derived from row.linked.
export type ClerkActivity = Record<
  string,
  { lastSignInAt: number | null; imageUrl: string | null; identity: Exclude<IdentityState, "unlinked"> }
>;

export type ActionResult = { ok: true } | { ok: false; error: string };

export type SessionsResult = { ok: true; activeSessions: number | null } | { ok: false; error: string };
