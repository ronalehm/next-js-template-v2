import { requirePermission, syncOwnIdentity } from "@/lib/auth";
import { ProfileView } from "@/modules/account";
import { getOwnCustomFields, getOwnProfile } from "@/modules/account/server";

export default async function ProfilePage() {
  const actor = await requirePermission("dashboard:view");
  await syncOwnIdentity(actor);
  const [profile, customFields] = await Promise.all([getOwnProfile(actor.id), getOwnCustomFields(actor.id)]);
  return <ProfileView profile={profile} customFields={customFields} />;
}
