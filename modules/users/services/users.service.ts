import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import type { Actor } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { can, type Role } from "@/lib/roles";
import { PANEL_ROLES } from "../schemas/users.schema";
import { assignableRoles, rowActions } from "../utils/userPermissions";
import type {
  ClerkActivity,
  EditUserInput,
  IdInput,
  InviteInput,
  NameInput,
  RoleInput,
  SortKey,
  UserRow,
  UsersPage,
  UsersQuery,
  UserStatus,
} from "../types/users.types";

// Messages shown to the user (D42). Any other error becomes the generic message in the action.
export class UsersError extends Error {
  override name = "UsersError";
}

const FORBIDDEN = "No tienes permiso para esta acción.";
const CHANGED = "El usuario cambió mientras tanto. Recarga la página.";

const PAGE_SIZE = 8;

// R39: closed map of hand-written fragments. Only a validated SortKey selects one; no input text reaches the SQL.
const ORDER_BY: Record<SortKey, string> = {
  name: "lower(coalesce(nullif(concat_ws(' ', first_name, last_name), ''), email)) asc",
  "-name": "lower(coalesce(nullif(concat_ws(' ', first_name, last_name), ''), email)) desc",
  email: "email asc",
  "-created": "created_at desc",
};

// R12: never leave zero active superadmins (same statement as the write).
const LAST_SUPERADMIN = `not (role = 'superadmin' and status = 'active'
  and (select count(*) from app_users where role = 'superadmin' and status = 'active') <= 1)`;

// Server-only: rows go to the client, clerkUserIds never do (D38).
export type UsersListing = { page: UsersPage; clerkUserIds: Record<string, string> };

type ListedRow = {
  total: number;
  page: number;
  id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: Role;
  status: UserStatus;
  clerk_user_id: string | null;
  created_at: Date | string;
};

type StoredRow = {
  role: Role;
  status: UserStatus;
  invitation_id: string | null;
  email: string;
  linked: boolean;
  clerk_user_id: string | null;
};

// Matrix (D37) against the role read from app_users in this request (D11).
function assertManager(actor: Actor) {
  if (!can(actor.role, "users:manage")) {
    throw new UsersError(FORBIDDEN);
  }
}

// D42: code and message only, never emails or personal data.
function logError(step: string, error: unknown, context: { step?: string } = {}) {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  console.error(`users.service: ${step} failed`, { code, message, ...context });
}

async function createInvitation(email: string, redirectUrl: string): Promise<string> {
  const client = await clerkClient();
  const invitation = await client.invitations.createInvitation({
    emailAddress: email,
    redirectUrl,
    notify: true,
    ignoreExisting: true,
  });
  return invitation.id;
}

// R6, E7: a 404 counts as done; any other error aborts before touching the database.
// Only deleteUser (RN-11) also tolerates 400 `invitation_already_revoked`; other callers keep 404 only.
async function revokeInvitation(invitationId: string, { tolerateRevoked = false } = {}) {
  const client = await clerkClient();
  try {
    await client.invitations.revokeInvitation(invitationId);
  } catch (error) {
    const done =
      isClerkAPIResponseError(error) &&
      (error.status === 404 ||
        (tolerateRevoked && error.status === 400 && error.errors[0]?.code === "invitation_already_revoked"));
    if (!done) throw error;
  }
}

// Compensation after a failed write: the new invitation must not stay valid. Its own failure is only logged.
async function revokeQuietly(invitationId: string) {
  try {
    await revokeInvitation(invitationId);
  } catch (error) {
    logError("compensating revoke", error);
  }
}

async function readRow(id: string): Promise<StoredRow | undefined> {
  const [row] = await getDb()`
    select role, status, invitation_id, email, clerk_user_id is not null as linked, clerk_user_id
    from app_users
    where id = ${id}`;
  return row as StoredRow | undefined;
}

export async function listUsers(actor: Actor, query: UsersQuery): Promise<UsersListing> {
  assertManager(actor);

  const sql = getDb();
  const orderBy = sql.unsafe(ORDER_BY[query.sort]);
  const pattern = `%${query.q.replace(/[\\%_]/g, "\\$&")}%`;

  // One statement: filtered total, page clamped to the last valid one, and that page (D35).
  const result = (await sql`
    with filtered as (
      select id, email, first_name, last_name, role, status, clerk_user_id, created_at
      from app_users
      where (${query.status} = 'all' or status = ${query.status})
        and (${query.role} = 'all' or role = ${query.role})
        and (${query.q} = '' or email ilike ${pattern} escape '\\' or first_name ilike ${pattern} escape '\\'
          or last_name ilike ${pattern} escape '\\' or (first_name || ' ' || last_name) ilike ${pattern} escape '\\')
    ),
    paging as (
      select count(*)::int as total,
        least(${query.page}::int, greatest(ceil(count(*) / 8.0)::int, 1)) as page
      from filtered
    )
    select p.total, p.page, f.id, f.email, f.first_name, f.last_name, f.role, f.status, f.clerk_user_id, f.created_at
    from paging p
    left join lateral (
      select filtered.*, row_number() over (order by ${orderBy}, id) as position
      from filtered
      order by ${orderBy}, id
      limit 8 offset (p.page - 1) * 8
    ) f on true
    order by f.position`) as ListedRow[];

  const total = result[0]?.total ?? 0;
  const clerkUserIds: Record<string, string> = {};
  const rows: UserRow[] = [];

  for (const row of result) {
    if (row.id === null) continue;
    if (row.clerk_user_id) clerkUserIds[row.id] = row.clerk_user_id;
    rows.push({
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role,
      status: row.status,
      linked: row.clerk_user_id !== null,
      createdAt: new Date(row.created_at).toISOString(),
    });
  }

  return {
    page: {
      rows,
      total,
      page: result[0]?.page ?? 1,
      pageCount: Math.max(Math.ceil(total / PAGE_SIZE), 1),
    },
    clerkUserIds,
  };
}

// D38: display only, one Clerk call per page. Never throws and never writes to the database.
export async function getClerkActivity(clerkUserIds: Record<string, string>): Promise<ClerkActivity> {
  const entries = Object.entries(clerkUserIds);
  if (entries.length === 0) return {};

  try {
    const client = await clerkClient();
    const { data } = await client.users.getUserList({ userId: Object.values(clerkUserIds), limit: entries.length });
    const byClerkId = new Map(data.map((user) => [user.id, user]));
    const activity: ClerkActivity = {};

    for (const [rowId, clerkUserId] of entries) {
      const user = byClerkId.get(clerkUserId);
      if (user) {
        activity[rowId] = { lastSignInAt: user.lastSignInAt ?? null, imageUrl: user.hasImage ? user.imageUrl : null };
      }
    }

    return activity;
  } catch (error) {
    logError("getUserList", error);
    return {};
  }
}

// D38: the Clerk id is read on the server from the row id; null without a link or if Clerk fails.
export async function countActiveSessions(actor: Actor, input: IdInput): Promise<number | null> {
  assertManager(actor);

  const [row] = await getDb()`select clerk_user_id from app_users where id = ${input.id}`;
  const clerkUserId = (row as { clerk_user_id: string | null } | undefined)?.clerk_user_id;
  if (!clerkUserId) return null;

  try {
    const client = await clerkClient();
    const { totalCount } = await client.sessions.getSessionList({ userId: clerkUserId, status: "active" });
    return totalCount;
  } catch (error) {
    logError("getSessionList", error);
    return null;
  }
}

// R42: Clerk first, then the insert. A failed insert revokes the new invitation (D40).
export async function inviteUser(actor: Actor, input: InviteInput, redirectUrl: string): Promise<void> {
  assertManager(actor);
  if (!assignableRoles(actor.role).includes(input.role)) {
    throw new UsersError(FORBIDDEN);
  }

  const sql = getDb();
  const [existing] = await sql`select status from app_users where email = ${input.email}`;
  const status = (existing as { status: UserStatus } | undefined)?.status;

  if (status === "invited") throw new UsersError("Ya tiene una invitación pendiente. Usa Reenviar invitación.");
  if (status === "active") throw new UsersError("Esa persona ya tiene acceso.");
  if (status === "revoked") throw new UsersError("Ese correo fue inactivado y no puede invitarse de nuevo.");

  const invitationId = await createInvitation(input.email, redirectUrl);

  let inserted: unknown[];
  try {
    inserted = await sql`
      insert into app_users (email, role, status, invitation_id)
      values (${input.email}, ${input.role}, 'invited', ${invitationId})
      on conflict (email) do nothing
      returning id`;
  } catch (error) {
    await revokeQuietly(invitationId);
    throw error;
  }

  if (inserted.length === 0) {
    await revokeQuietly(invitationId);
    throw new UsersError("Ese correo ya está registrado.");
  }
}

// USERS-1b: admin and superadmin. The new role is checked against PANEL_ROLES (never superadmin);
// assignableRoles only filters the rows the actor manages (it stays untouched, so invite/revoke/activate/resend don't change).
// The invited branch (RN-08) exists only for superadmin, computed here and never taken from the client.
export async function changeUserRole(actor: Actor, input: RoleInput): Promise<void> {
  assertManager(actor);
  if (!PANEL_ROLES.includes(input.role) || input.id === actor.id) {
    throw new UsersError(FORBIDDEN);
  }

  const sql = getDb();
  const isSuperadmin = actor.role === "superadmin";
  const updated = await sql`
    update app_users set role = ${input.role}, updated_at = now()
    where id = ${input.id}
      and id <> ${actor.id}
      and role = any(${assignableRoles(actor.role)})
      and ((status = 'active' and clerk_user_id is not null)
        or (${isSuperadmin}::boolean and status = 'invited' and clerk_user_id is null))
      and role is distinct from ${input.role}
      and ${sql.unsafe(LAST_SUPERADMIN)}
    returning id`;

  if (updated.length === 0) {
    throw new UsersError("No se pudo cambiar el rol. Recarga la página.");
  }
}

const NAME_INVALID = "No se pudo guardar: revisa el nombre y el apellido.";
const PARTIAL =
  "El cambio se guardó solo en parte: se actualizó en la cuenta, pero no en el panel. Vuelve a intentarlo.";

// USERS-1: Clerk first (one call, no retries, no rollback), then a conditional update in Neon.
export async function updateUserName(actor: Actor, input: NameInput): Promise<void> {
  assertManager(actor);

  const sql = getDb();
  const [row] = (await sql`
    select role, status, clerk_user_id, first_name, last_name
    from app_users
    where id = ${input.id}`) as {
    role: Role;
    status: UserStatus;
    clerk_user_id: string | null;
    first_name: string | null;
    last_name: string | null;
  }[];
  if (!row) throw new UsersError(CHANGED);

  if (input.id === actor.id || !assignableRoles(actor.role).includes(row.role)) {
    throw new UsersError(FORBIDDEN);
  }
  if (
    row.status !== "active" ||
    !row.clerk_user_id ||
    row.first_name !== input.expectedFirstName ||
    row.last_name !== input.expectedLastName
  ) {
    throw new UsersError(CHANGED);
  }

  try {
    const client = await clerkClient();
    await client.users.updateUser(row.clerk_user_id, { firstName: input.firstName, lastName: input.lastName });
  } catch (error) {
    if (isClerkAPIResponseError(error) && error.status === 422) throw new UsersError(NAME_INVALID);
    throw error;
  }

  // Clerk is already updated: any failure from here is the partial state, never CHANGED or success.
  let updated: unknown[] = [];
  try {
    updated = await sql`
      update app_users set first_name = ${input.firstName}, last_name = ${input.lastName}, updated_at = now()
      where id = ${input.id}
        and id <> ${actor.id}
        and role = any(${assignableRoles(actor.role)})
        and status = 'active'
        and clerk_user_id = ${row.clerk_user_id}
        and first_name is not distinct from ${input.expectedFirstName}
        and last_name is not distinct from ${input.expectedLastName}
      returning id`;
  } catch (error) {
    logError("updateUserName", error, { step: "neon-after-clerk" });
    throw new UsersError(PARTIAL);
  }

  if (updated.length === 0) {
    logError("updateUserName", undefined, { step: "neon-after-clerk" });
    throw new UsersError(PARTIAL);
  }
}

const ROLE_PARTIAL = "El nombre se guardó, pero el rol no se pudo cambiar. Recarga la página y vuelve a intentarlo.";

// USERS-1b RN-06: name first (Clerk + Neon), then role. No rollback, no retries. Role-only payloads (invited rows) skip the name step.
export async function updateUser(actor: Actor, input: EditUserInput): Promise<void> {
  assertManager(actor);
  if (input.id === actor.id || !PANEL_ROLES.includes(input.role)) {
    throw new UsersError(FORBIDDEN);
  }

  const nameChanged =
    "firstName" in input && (input.firstName !== input.expectedFirstName || input.lastName !== input.expectedLastName);
  const roleChanged = input.role !== input.expectedRole;

  if (nameChanged) await updateUserName(actor, input);

  if (roleChanged) {
    try {
      await changeUserRole(actor, { id: input.id, role: input.role });
    } catch (error) {
      if (!nameChanged) throw error;
      logError("updateUser", error, { step: "neon-role-after-name" });
      throw new UsersError(ROLE_PARTIAL);
    }
  }
}

// R6, R44: revoke the pending invitation in Clerk first, then a conditional update on what was read.
export async function revokeUser(actor: Actor, input: IdInput): Promise<void> {
  assertManager(actor);

  const row = await readRow(input.id);
  if (!row || row.status === "revoked") throw new UsersError(CHANGED);
  // The matrix is checked before Clerk, so a forbidden row never loses its invitation.
  if (!rowActions(actor, { id: input.id, ...row }).revoke) throw new UsersError(FORBIDDEN);

  if (row.status === "invited" && row.invitation_id) {
    await revokeInvitation(row.invitation_id);
  }

  const sql = getDb();
  const updated = await sql`
    update app_users set status = 'revoked', updated_at = now()
    where id = ${input.id}
      and status = ${row.status}
      and invitation_id is not distinct from ${row.invitation_id}
      and id <> ${actor.id}
      and role = any(${assignableRoles(actor.role)})
      and ${sql.unsafe(LAST_SUPERADMIN)}
    returning id`;

  if (updated.length === 0) {
    throw new UsersError(CHANGED);
  }
}

const PARTIAL_DELETE = "La cuenta se eliminó, pero el registro del panel no. Vuelve a intentarlo.";

// RN-11: only the listed Clerk errors count as done; anything else is rethrown (generic message) before touching Neon.
function clerkFailure(step: string, error: unknown) {
  const clerkError = isClerkAPIResponseError(error) ? error : undefined;
  logError("deleteUser", { code: clerkError?.errors[0]?.code ?? (error as { code?: unknown })?.code, message: (error as Error)?.message }, { step });
}

// USERS-DELETE: Clerk first (irreversible, so every permission check comes before), then one conditional delete in Neon.
// LAST_SUPERADMIN is not needed: the target is never a superadmin, so the active superadmin count cannot drop.
// Profile and custom fields go by `on delete cascade`. TOCTOU between readRow and Clerk is accepted (RN-12).
export async function deleteUser(actor: Actor, input: { id: string; email: string }): Promise<void> {
  assertManager(actor);

  const row = await readRow(input.id);
  if (!row || row.email !== input.email) throw new UsersError(CHANGED);
  if (!rowActions(actor, { id: input.id, ...row }).remove) throw new UsersError(FORBIDDEN);

  let clerkActed = false;
  if (row.clerk_user_id) {
    try {
      const client = await clerkClient();
      await client.users.deleteUser(row.clerk_user_id);
    } catch (error) {
      if (!(isClerkAPIResponseError(error) && error.status === 404)) {
        clerkFailure("clerk-delete-user", error);
        throw error;
      }
    }
    clerkActed = true;
  } else if (row.status === "invited" && row.invitation_id) {
    try {
      await revokeInvitation(row.invitation_id, { tolerateRevoked: true });
    } catch (error) {
      clerkFailure("clerk-revoke-invitation", error);
      throw error;
    }
    clerkActed = true;
  }

  let deleted: unknown[] = [];
  try {
    deleted = await getDb()`
      delete from app_users
      where id = ${input.id}
        and email = ${row.email}
        and role = ${row.role}
        and status = ${row.status}
        and clerk_user_id is not distinct from ${row.clerk_user_id}
        and invitation_id is not distinct from ${row.invitation_id}
        and role <> 'superadmin'
        and id <> ${actor.id}
        and clerk_user_id is distinct from ${actor.clerkUserId}
      returning id`;
  } catch (error) {
    if (!clerkActed) throw error;
    logError("deleteUser", error, { step: "neon-after-clerk" });
    throw new UsersError(PARTIAL_DELETE);
  }

  if (deleted.length === 0) {
    if (!clerkActed) throw new UsersError(CHANGED);
    logError("deleteUser", undefined, { step: "neon-after-clerk" });
    throw new UsersError(PARTIAL_DELETE);
  }
}

// R45, D36: only revoked rows already linked; the condition lives in the statement. No Clerk call.
export async function activateUser(actor: Actor, input: IdInput): Promise<void> {
  assertManager(actor);

  const sql = getDb();
  const updated = await sql`
    update app_users set status = 'active', updated_at = now()
    where id = ${input.id}
      and status = 'revoked'
      and clerk_user_id is not null
      and id <> ${actor.id}
      and role = any(${assignableRoles(actor.role)})
      and ${sql.unsafe(LAST_SUPERADMIN)}
    returning id`;

  if (updated.length === 0) {
    throw new UsersError("Solo se puede activar a quien ya había entrado al panel.");
  }
}

// R46, D40: controlled replacement. Revoke the old one, create a new one, then a conditional update.
export async function resendInvitation(actor: Actor, input: IdInput, redirectUrl: string): Promise<void> {
  assertManager(actor);

  const row = await readRow(input.id);
  if (!row || row.status !== "invited") throw new UsersError(CHANGED);
  if (!rowActions(actor, { id: input.id, ...row }).resend) throw new UsersError(FORBIDDEN);

  if (row.invitation_id) {
    await revokeInvitation(row.invitation_id);
  }

  const invitationId = await createInvitation(row.email, redirectUrl);

  let updated: unknown[];
  try {
    updated = await getDb()`
      update app_users set invitation_id = ${invitationId}, updated_at = now()
      where id = ${input.id}
        and status = 'invited'
        and invitation_id is not distinct from ${row.invitation_id}
        and role = any(${assignableRoles(actor.role)})
      returning id`;
  } catch (error) {
    await revokeQuietly(invitationId);
    throw error;
  }

  if (updated.length === 0) {
    await revokeQuietly(invitationId);
    throw new UsersError(CHANGED);
  }
}
