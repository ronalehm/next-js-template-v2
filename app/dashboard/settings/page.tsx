import { requirePermission } from "@/lib/auth";
import { SettingsView } from "@/modules/account";

export default async function SettingsPage() {
  await requirePermission("dashboard:view");
  return <SettingsView />;
}
