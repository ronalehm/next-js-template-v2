import "server-only";
import { getDb } from "@/lib/db";

// SYNC-3 RN-05: the only statement of the webhook. Writes only clerk_deleted_user_id (no updated_at),
// matches the exact clerk_user_id and is idempotent. Throws only if Neon fails.
export async function recordClerkUserDeleted(clerkUserId: string): Promise<void> {
  await getDb()`
    update app_users
    set clerk_deleted_user_id = ${clerkUserId}
    where clerk_user_id = ${clerkUserId}
      and clerk_deleted_user_id is distinct from ${clerkUserId}
    returning id`;
}
