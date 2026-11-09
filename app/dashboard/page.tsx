import { requirePermission } from "@/lib/auth";
import { AccountSummary } from "@/modules/account";

export default async function DashboardPage() {
  const actor = await requirePermission("dashboard:view");
  return <AccountSummary role={actor.role} />;
}
