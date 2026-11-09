import { describe, expect, it } from "vitest";
import type { Role } from "@/lib/roles";
import type { UserStatus } from "../types/users.types";
import { assignableRoles, rowActions } from "./userPermissions";

const ACTOR_ID = "actor";

const actions = (actorRole: Role, role: Role, status: UserStatus, linked = status !== "invited", id = "row") =>
  rowActions({ id: ACTOR_ID, role: actorRole }, { id, role, status, linked });

const NONE = { changeRole: false, revoke: false, activate: false, resend: false };

describe("assignableRoles", () => {
  it.each([
    ["user", []],
    ["admin", ["user"]],
    ["superadmin", ["user", "admin"]],
  ] as const)("%s assigns %j", (role, expected) => {
    expect(assignableRoles(role)).toEqual(expected);
  });
});

describe("rowActions (D37)", () => {
  it.each(["user", "admin", "superadmin"] as const)("user has no action on a %s row", (role) => {
    for (const status of ["active", "invited", "revoked"] as const) {
      expect(actions("user", role, status)).toEqual(NONE);
    }
  });

  describe("admin", () => {
    it("revokes an active user row but does not change its role", () => {
      expect(actions("admin", "user", "active")).toEqual({ ...NONE, revoke: true });
    });

    it("revokes and resends an invited user row", () => {
      expect(actions("admin", "user", "invited")).toEqual({ ...NONE, revoke: true, resend: true });
    });

    it("activates a revoked linked user row", () => {
      expect(actions("admin", "user", "revoked", true)).toEqual({ ...NONE, activate: true });
    });

    it.each(["admin", "superadmin"] as const)("has no action on a %s row", (role) => {
      for (const status of ["active", "invited", "revoked"] as const) {
        expect(actions("admin", role, status, true)).toEqual(NONE);
      }
    });
  });

  describe("superadmin", () => {
    it.each(["user", "admin"] as const)("changes role and revokes an active %s row", (role) => {
      expect(actions("superadmin", role, "active")).toEqual({ ...NONE, changeRole: true, revoke: true });
    });

    it.each(["user", "admin"] as const)("changes role, revokes and resends an invited %s row", (role) => {
      expect(actions("superadmin", role, "invited")).toEqual({ changeRole: true, revoke: true, activate: false, resend: true });
    });

    it.each(["user", "admin"] as const)("only activates a revoked linked %s row (no role change)", (role) => {
      expect(actions("superadmin", role, "revoked", true)).toEqual({ ...NONE, activate: true });
    });

    it("has no action on a superadmin row", () => {
      for (const status of ["active", "invited", "revoked"] as const) {
        expect(actions("superadmin", "superadmin", status, true)).toEqual(NONE);
      }
    });
  });

  it.each(["admin", "superadmin"] as const)("%s has no action on its own row", (role) => {
    // Own row with a lower-rank role cannot happen in practice; the id rule still wins.
    expect(actions(role, "user", "active", true, ACTOR_ID)).toEqual(NONE);
    expect(actions(role, "user", "revoked", true, ACTOR_ID)).toEqual(NONE);
  });

  it("never offers Activar for a revoked row that was never linked", () => {
    expect(actions("superadmin", "user", "revoked", false)).toEqual(NONE);
    expect(actions("admin", "user", "revoked", false)).toEqual(NONE);
  });

  it("offers Reenviar only for invited rows", () => {
    expect(actions("superadmin", "user", "active").resend).toBe(false);
    expect(actions("superadmin", "user", "revoked", true).resend).toBe(false);
    expect(actions("superadmin", "user", "invited").resend).toBe(true);
  });
});
