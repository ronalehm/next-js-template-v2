import { requirePermission } from "@/lib/auth";
import { ProfileView } from "@/modules/account";

export default async function ProfilePage() {
  const actor = await requirePermission("dashboard:view");
  return <ProfileView role={actor.role} />;
}
