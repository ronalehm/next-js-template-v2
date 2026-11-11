import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/roles";
import { UsersNoAccess, UsersView, usersQuerySchema } from "@/modules/users";
import { getClerkActivity, listUsers } from "@/modules/users/server";

export default async function UsersPage({ searchParams }: PageProps<"/dashboard/users">) {
  const actor = await requirePermission("dashboard:view");

  // D39: a user sees the no-access view inside the shell, without reading any more data.
  if (!can(actor.role, "users:manage")) {
    return <UsersNoAccess />;
  }

  const query = usersQuerySchema.parse(await searchParams);
  const listing = await listUsers(actor, query);
  const activity = await getClerkActivity(listing.clerkUserIds, listing.identityRowIds, listing.deletedSignalRowIds);

  // clerkUserIds stays on the server (D38).
  return (
    <UsersView actor={{ id: actor.id, role: actor.role }} page={listing.page} query={query} activity={activity} />
  );
}
