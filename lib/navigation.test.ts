import { LayoutDashboard, Users } from "lucide-react";
import { describe, expect, it } from "vitest";
import { NAV_ITEMS, type NavItem, visibleNavItems } from "@/lib/navigation";
import { ROLES } from "@/lib/roles";

const open: NavItem = { title: "Abierto", href: "/a", icon: LayoutDashboard };
const managed: NavItem = { title: "Gestión", href: "/b", icon: Users, permission: "users:manage" };
const last: NavItem = { title: "Último", href: "/c", icon: LayoutDashboard };
const items = [open, managed, last];

describe("visibleNavItems", () => {
  it.each(ROLES)("shows items without permission to %s", (role) => {
    expect(visibleNavItems(role, [open])).toEqual([open]);
  });

  it("hides users:manage items from user", () => {
    expect(visibleNavItems("user", items)).toEqual([open, last]);
  });

  it.each(["admin", "superadmin"] as const)("shows users:manage items to %s, keeping order", (role) => {
    expect(visibleNavItems(role, items)).toEqual([open, managed, last]);
  });

  it("defaults to NAV_ITEMS", () => {
    expect(visibleNavItems("user")).toEqual([...NAV_ITEMS]);
  });
});

describe("NAV_ITEMS", () => {
  it("does not link to /dashboard/users yet (D12)", () => {
    expect(NAV_ITEMS.map((item) => item.href)).not.toContain("/dashboard/users");
  });
});
