import { describe, expect, it } from "vitest";
import { canManageRole, ROLES } from "@/lib/roles";
import { canSeeIdentity, IDENTITY_LABELS, identityOf } from "./identityStatus";

const base = { lastSignInAt: null, imageUrl: null, identity: "unverified" as const };

describe("identityOf", () => {
  it("returns unlinked when the row has no link, regardless of activity", () => {
    expect(identityOf({ linked: false }, undefined)).toBe("unlinked");
    expect(identityOf({ linked: false }, { ...base, identity: "not_found" })).toBe("unlinked");
  });

  it("returns unverified for a linked row without entry", () => {
    expect(identityOf({ linked: true }, undefined)).toBe("unverified");
  });

  it.each(["verified", "not_found", "unverified"] as const)("returns the entry identity %s", (identity) => {
    expect(identityOf({ linked: true }, { ...base, identity })).toBe(identity);
  });
});

describe("canSeeIdentity", () => {
  it("equals canManageRole for every role pair", () => {
    for (const actor of ROLES) {
      for (const row of ROLES) expect(canSeeIdentity(actor, row)).toBe(canManageRole(actor, row));
    }
  });

  it("matches the hierarchy matrix", () => {
    expect(canSeeIdentity("admin", "user")).toBe(true);
    expect(canSeeIdentity("superadmin", "user")).toBe(true);
    expect(canSeeIdentity("superadmin", "admin")).toBe(true);
    expect(canSeeIdentity("admin", "admin")).toBe(false);
    expect(canSeeIdentity("admin", "superadmin")).toBe(false);
    expect(canSeeIdentity("superadmin", "superadmin")).toBe(false);
    expect(canSeeIdentity("user", "user")).toBe(false);
  });
});

describe("IDENTITY_LABELS", () => {
  it("has the four Spanish labels", () => {
    expect(IDENTITY_LABELS).toEqual({
      verified: "Verificada",
      not_found: "No encontrada",
      unverified: "Sin verificar",
      unlinked: "Sin vincular",
    });
  });
});
