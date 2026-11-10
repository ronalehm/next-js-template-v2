import { describe, expect, it } from "vitest";
import type { Role } from "@/lib/roles";
import type { UserStatus } from "../types/users.types";
import { assignableRoles, rowActions } from "./userPermissions";

const ACTOR_ID = "actor";

const actions = (actorRole: Role, role: Role, status: UserStatus, linked = status !== "invited", id = "row") =>
  rowActions({ id: ACTOR_ID, role: actorRole }, { id, role, status, linked });

const NONE = { edit: false, revoke: false, activate: false, resend: false, remove: false, recover: false };

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
    it("edits and revokes an active user row", () => {
      expect(actions("admin", "user", "active")).toEqual({ ...NONE, edit: true, revoke: true, recover: true });
    });

    it("revokes and resends an invited user row but does not edit it", () => {
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
    it.each(["user", "admin"] as const)("edits and revokes an active %s row", (role) => {
      expect(actions("superadmin", role, "active")).toEqual({ ...NONE, edit: true, revoke: true, remove: true, recover: true });
    });

    it.each(["user", "admin"] as const)("edits (role only), revokes and resends an invited %s row", (role) => {
      expect(actions("superadmin", role, "invited")).toEqual({ ...NONE, edit: true, revoke: true, resend: true, remove: true });
    });

    it.each(["user", "admin"] as const)("only activates a revoked linked %s row", (role) => {
      expect(actions("superadmin", role, "revoked", true)).toEqual({ ...NONE, activate: true, remove: true });
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
    expect(actions("superadmin", "user", "revoked", false)).toEqual({ ...NONE, remove: true });
    expect(actions("admin", "user", "revoked", false)).toEqual(NONE);
  });

  it("offers Editar only for active linked rows, plus invited rows for superadmin", () => {
    expect(actions("superadmin", "user", "active", true).edit).toBe(true);
    expect(actions("superadmin", "user", "active", false).edit).toBe(false);
    expect(actions("superadmin", "user", "invited").edit).toBe(true);
    expect(actions("admin", "user", "invited").edit).toBe(false);
    expect(actions("admin", "user", "revoked", true).edit).toBe(false);
    expect(actions("superadmin", "user", "revoked", true).edit).toBe(false);
  });

  it("offers Reenviar only for invited rows", () => {
    expect(actions("superadmin", "user", "active").resend).toBe(false);
    expect(actions("superadmin", "user", "revoked", true).resend).toBe(false);
    expect(actions("superadmin", "user", "invited").resend).toBe(true);
  });

  it("offers recover only for active linked rows of a managed role, never self or superadmin (RN-01, AC-14)", () => {
    expect(actions("admin", "user", "active", true).recover).toBe(true);
    expect(actions("superadmin", "user", "active", true).recover).toBe(true);
    expect(actions("superadmin", "admin", "active", true).recover).toBe(true);
    // admin over admin/superadmin: only a superadmin manages admin rows
    expect(actions("admin", "admin", "active", true).recover).toBe(false);
    expect(actions("admin", "superadmin", "active", true).recover).toBe(false);
    expect(actions("superadmin", "superadmin", "active", true).recover).toBe(false);
    expect(actions("user", "user", "active", true).recover).toBe(false);
    // not eligible: revoked, invited (unlinked), active but unlinked, own row
    expect(actions("superadmin", "user", "revoked", true).recover).toBe(false);
    expect(actions("superadmin", "user", "invited").recover).toBe(false);
    expect(actions("superadmin", "user", "active", false).recover).toBe(false);
    expect(actions("superadmin", "user", "active", true, ACTOR_ID).recover).toBe(false);
  });

  it("offers remove only to a superadmin on other user/admin rows in any status (RN-01, RN-02)", () => {
    for (const status of ["active", "invited", "revoked"] as const) {
      for (const linked of [true, false]) {
        expect(actions("superadmin", "user", status, linked).remove).toBe(true);
        expect(actions("superadmin", "admin", status, linked).remove).toBe(true);
        expect(actions("superadmin", "superadmin", status, linked).remove).toBe(false);
        expect(actions("superadmin", "user", status, linked, ACTOR_ID).remove).toBe(false);
        expect(actions("admin", "user", status, linked).remove).toBe(false);
        expect(actions("user", "user", status, linked).remove).toBe(false);
      }
    }
  });
});
