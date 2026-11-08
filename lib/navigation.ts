import { LayoutDashboard, type LucideIcon } from "lucide-react";
import { can, type Permission, type Role } from "@/lib/roles";

export const APP_NAME = "Panel";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { title: "Inicio", href: "/dashboard", icon: LayoutDashboard },
];

// UI filter only, not access control: every route checks its permission on the server (D14).
export function visibleNavItems(role: Role, items: readonly NavItem[] = NAV_ITEMS): NavItem[] {
  return items.filter((item) => !item.permission || can(role, item.permission));
}
