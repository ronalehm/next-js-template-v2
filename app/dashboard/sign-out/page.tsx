import { requirePermission } from "@/lib/auth";
import { SignOutCard } from "@/modules/account";

export default async function SignOutPage() {
  await requirePermission("dashboard:view");
  return <SignOutCard />;
}
