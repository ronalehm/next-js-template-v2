import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { can, parseRole, type Permission, type Role } from "@/lib/roles";

export type Actor = { id: string; clerkUserId: string; email: string; role: Role };

type AppUserRow = { id: string; clerk_user_id: string; email: string; role: unknown };

function toActor(row: AppUserRow): Actor | null {
  const role = parseRole(row.role);
  return role
    ? { id: row.id, clerkUserId: row.clerk_user_id, email: row.email, role }
    : null;
}

// Role and status always come from app_users in this request (D1, D11);
// Clerk only proves identity. publicMetadata is never read.
async function findActor(clerkUserId: string): Promise<Actor | null> {
  const sql = getDb();

  const [linked] = await sql`
    select id, clerk_user_id, email, role, status
    from app_users
    where clerk_user_id = ${clerkUserId}`;

  if (linked) {
    return linked.status === "active" ? toActor(linked as AppUserRow) : null;
  }

  // First sign-in: link an invited, unlinked row by verified primary email (D2).
  const user = await currentUser();
  const primary = user?.primaryEmailAddress;

  if (!primary || primary.verification?.status !== "verified") {
    return null;
  }

  // The same statement copies Clerk's name (D32).
  const [activated] = await sql`
    update app_users
    set clerk_user_id = ${clerkUserId}, status = 'active',
      first_name = ${user.firstName ?? null}, last_name = ${user.lastName ?? null}, updated_at = now()
    where email = ${primary.emailAddress.toLowerCase()}
      and status = 'invited'
      and clerk_user_id is null
    returning id, clerk_user_id, email, role`;

  return activated ? toActor(activated as AppUserRow) : null;
}

export async function getActor(): Promise<Actor | null> {
  const { userId } = await auth();
  return userId ? findActor(userId) : null;
}

export async function requirePermission(permission: Permission): Promise<Actor> {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const actor = await findActor(userId);

  if (!actor || !can(actor.role, permission)) {
    redirect("/");
  }

  return actor;
}

// Logs code and message only: the error detail can contain personal data (e.g. the duplicated email).
function logSyncError(step: string, error: unknown) {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  console.error(`syncOwnIdentity: ${step} failed`, { code, message });
}

// D32, R35: copy name and verified primary email from Clerk to the actor's own app_users row.
// Two independent statements, each a no-op if nothing changed; an email failure never undoes the
// names. Only first_name, last_name, email and updated_at are written. Never throws.
export async function syncOwnIdentity(actor: Actor): Promise<void> {
  let user: Awaited<ReturnType<typeof currentUser>>;
  try {
    user = await currentUser();
  } catch (error) {
    logSyncError("currentUser", error);
    return;
  }

  if (!user || user.id !== actor.clerkUserId) {
    return;
  }

  const sql = getDb();
  const firstName = user.firstName ?? null;
  const lastName = user.lastName ?? null;

  try {
    await sql`
      update app_users
      set first_name = ${firstName}, last_name = ${lastName}, updated_at = now()
      where id = ${actor.id}
        and (first_name is distinct from ${firstName} or last_name is distinct from ${lastName})`;
  } catch (error) {
    logSyncError("names update", error);
  }

  const primary = user.primaryEmailAddress;
  if (!primary || primary.verification?.status !== "verified") {
    return;
  }

  const email = primary.emailAddress.toLowerCase();

  // `not exists` covers the usual collision; a race that slips past it fails with 23505 and is logged.
  try {
    await sql`
      update app_users
      set email = ${email}, updated_at = now()
      where id = ${actor.id}
        and email is distinct from ${email}
        and not exists (select 1 from app_users where email = ${email} and id <> ${actor.id})`;
  } catch (error) {
    logSyncError("email update", error);
  }
}
