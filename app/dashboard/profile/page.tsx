import { requirePermission, syncOwnIdentity } from "@/lib/auth";
import { ProfileView } from "@/modules/account";
import { getOwnProfile } from "@/modules/account/server";

export default async function ProfilePage() {
  const actor = await requirePermission("dashboard:view");
  await syncOwnIdentity(actor);
  const profile = await getOwnProfile(actor.id);
  return <ProfileView profile={profile} />;
}
