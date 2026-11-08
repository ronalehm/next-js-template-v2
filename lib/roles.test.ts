import { describe, expect, it } from "vitest";
import { can, canManageRole, parseRole, type Permission, type Role } from "./roles";

describe("parseRole", () => {
  it.each(["user", "admin", "superadmin"] as const)("returns %s", (role) => {
    expect(parseRole(role)).toBe(role);
  });

  it.each([null, undefined, "", "owner", "Admin", " admin", 1, {}, ["admin"]])(
    "returns null for %j",
    (value) => {
      expect(parseRole(value)).toBeNull();
    },
  );
});

describe("can", () => {
  const cases: [Role | null, Permission, boolean][] = [
    ["user", "dashboard:view", true],
    ["admin", "dashboard:view", true],
    ["superadmin", "dashboard:view", true],
    [null, "dashboard:view", false],
    ["user", "users:manage", false],
    ["admin", "users:manage", true],
    ["superadmin", "users:manage", true],
    [null, "users:manage", false],
  ];

  it.each(cases)("%s / %s -> %s", (role, permission, expected) => {
    expect(can(role, permission)).toBe(expected);
  });
});

describe("canManageRole", () => {
  const cases: [Role, Role, boolean][] = [
    ["user", "user", false],
    ["user", "admin", false],
    ["user", "superadmin", false],
    ["admin", "user", true],
    ["admin", "admin", false],
    ["admin", "superadmin", false],
    ["superadmin", "user", true],
    ["superadmin", "admin", true],
    ["superadmin", "superadmin", false],
  ];

  it.each(cases)("%s over %s -> %s", (actor, target, expected) => {
    expect(canManageRole(actor, target)).toBe(expected);
  });
});
