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

  const [activated] = await sql`
    update app_users
    set clerk_user_id = ${clerkUserId}, status = 'active', updated_at = now()
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
