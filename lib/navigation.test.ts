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

  it.each(["admin", "superadmin"] as const)("defaults to NAV_ITEMS for %s", (role) => {
    expect(visibleNavItems(role)).toEqual([...NAV_ITEMS]);
  });
});

describe("NAV_ITEMS (CA-52)", () => {
  it("has Usuarios at /dashboard/users with users:manage, right after Inicio", () => {
    expect(NAV_ITEMS.map(({ title, href, permission }) => ({ title, href, permission }))).toEqual([
      { title: "Inicio", href: "/dashboard", permission: undefined },
      { title: "Usuarios", href: "/dashboard/users", permission: "users:manage" },
    ]);
  });

  it("hides Usuarios from user", () => {
    expect(visibleNavItems("user").map((item) => item.href)).toEqual(["/dashboard"]);
  });
});
