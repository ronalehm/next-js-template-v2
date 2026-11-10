import { describe, expect, it } from "vitest";
import {
  deleteUserInputSchema,
  editUserInputSchema,
  idInputSchema,
  inviteInputSchema,
  nameInputSchema,
  recoverInputSchema,
  roleInputSchema,
  userDeletedSchema,
  usersQuerySchema,
} from "./users.schema";

describe("userDeletedSchema", () => {
  const valid = { type: "user.deleted", data: { id: "user_2abcDEF123", deleted: true } };

  it("accepts a valid user.deleted payload and ignores extra fields", () => {
    expect(userDeletedSchema.safeParse(valid).success).toBe(true);
    expect(userDeletedSchema.parse({ ...valid, object: "event" }).data.id).toBe("user_2abcDEF123");
  });

  it.each([
    ["missing id", { type: "user.deleted", data: { deleted: true } }],
    ["id out of pattern", { type: "user.deleted", data: { id: "org_123", deleted: true } }],
    ["id with invalid chars", { type: "user.deleted", data: { id: "user_1;drop", deleted: true } }],
    ["id too long", { type: "user.deleted", data: { id: `user_${"a".repeat(65)}`, deleted: true } }],
    ["deleted false", { type: "user.deleted", data: { id: "user_1", deleted: false } }],
    ["deleted missing", { type: "user.deleted", data: { id: "user_1" } }],
    ["other type", { type: "user.created", data: { id: "user_1", deleted: true } }],
  ])("rejects %s", (_name, payload) => {
    expect(userDeletedSchema.safeParse(payload).success).toBe(false);
  });
});

const UUID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const DEFAULTS = { q: "", status: "all", role: "all", sort: "name", page: 1 };

describe("usersQuerySchema", () => {
  it("uses the defaults when nothing is given", () => {
    expect(usersQuerySchema.parse({})).toEqual(DEFAULTS);
  });

  it("keeps valid values", () => {
    expect(
      usersQuerySchema.parse({ q: "  ana ", status: "revoked", role: "superadmin", sort: "-created", page: "3" }),
    ).toEqual({ q: "ana", status: "revoked", role: "superadmin", sort: "-created", page: 3 });
  });

  it("falls back to each default for invalid values without failing", () => {
    expect(
      usersQuerySchema.parse({ q: ["a", "b"], status: "disabled", role: "owner", sort: "id; drop", page: "x" }),
    ).toEqual(DEFAULTS);
  });

  it("trims q and cuts it to 100 characters", () => {
    expect(usersQuerySchema.parse({ q: `  ${"a".repeat(150)}` }).q).toBe("a".repeat(100));
  });

  it.each(["0", "-2", "1.5", "abc", ""])("turns page %j into 1", (page) => {
    expect(usersQuerySchema.parse({ page }).page).toBe(1);
  });

  it("caps a huge page to a valid integer parameter", () => {
    expect(usersQuerySchema.parse({ page: "99999999999" }).page).toBe(2_147_483_647);
  });
});

describe("inviteInputSchema", () => {
  it("trims and lowercases the email", () => {
    expect(inviteInputSchema.parse({ email: "  Ana@Example.COM ", role: "user" })).toEqual({
      email: "ana@example.com",
      role: "user",
    });
  });

  it.each(["no-es-correo", "", `${"a".repeat(250)}@x.com`])("rejects the invalid email %j", (email) => {
    expect(inviteInputSchema.safeParse({ email, role: "user" }).success).toBe(false);
  });

  it("rejects superadmin and extra keys", () => {
    expect(inviteInputSchema.safeParse({ email: "a@b.com", role: "superadmin" }).success).toBe(false);
    expect(inviteInputSchema.safeParse({ email: "a@b.com", role: "user", id: UUID }).success).toBe(false);
  });
});

describe("nameInputSchema", () => {
  const valid = { id: UUID, firstName: "Ana", lastName: "Pérez", expectedFirstName: null, expectedLastName: "P" };
  const parse = (patch: object) => nameInputSchema.safeParse({ ...valid, ...patch }).success;

  it("accepts a valid payload and normalizes spaces", () => {
    expect(nameInputSchema.parse(valid)).toEqual(valid);
    expect(nameInputSchema.parse({ ...valid, firstName: "  Ana   María " }).firstName).toBe("Ana María");
  });

  it.each(["", "   ", "a".repeat(51), "Ana\nMaría", "Ana\tM", "Ana\u0000"])("rejects the name %j", (name) => {
    expect(parse({ firstName: name })).toBe(false);
    expect(parse({ lastName: name })).toBe(false);
  });

  it("accepts exactly 50 characters", () => {
    expect(parse({ firstName: "a".repeat(50) })).toBe(true);
  });

  it("rejects a non-uuid id, extra keys and invalid expected values", () => {
    expect(parse({ id: "row-1" })).toBe(false);
    expect(parse({ clerkUserId: "user_1" })).toBe(false);
    expect(parse({ role: "admin" })).toBe(false);
    expect(parse({ email: "a@b.com" })).toBe(false);
    expect(parse({ expectedFirstName: 1 })).toBe(false);
    expect(parse({ expectedLastName: undefined })).toBe(false);
  });
});

describe("editUserInputSchema", () => {
  const names = { firstName: "Ana", lastName: "Pérez", expectedFirstName: null, expectedLastName: "P" };
  const full = { id: UUID, ...names, role: "admin", expectedRole: "user" };
  const roleOnly = { id: UUID, role: "admin", expectedRole: "user" };
  const ok = (payload: object) => editUserInputSchema.safeParse(payload).success;

  it("accepts a full payload with user and admin roles", () => {
    expect(ok(full)).toBe(true);
    expect(ok({ ...full, role: "user" })).toBe(true);
  });

  it("accepts a role-only payload", () => {
    expect(ok(roleOnly)).toBe(true);
  });

  it("rejects superadmin as new role and an invalid expectedRole", () => {
    expect(ok({ ...full, role: "superadmin" })).toBe(false);
    expect(ok({ ...roleOnly, role: "superadmin" })).toBe(false);
    expect(ok({ ...full, expectedRole: "root" })).toBe(false);
    expect(ok({ ...roleOnly, expectedRole: undefined })).toBe(false);
  });

  it("rejects extra keys", () => {
    expect(ok({ ...full, clerkUserId: "user_1" })).toBe(false);
    expect(ok({ ...roleOnly, email: "a@b.com" })).toBe(false);
  });

  it("rejects role-only with names, and a single name", () => {
    expect(ok({ ...roleOnly, firstName: "Ana" })).toBe(false);
    expect(ok({ ...roleOnly, lastName: "Pérez" })).toBe(false);
    expect(ok({ ...roleOnly, firstName: "Ana", lastName: "Pérez" })).toBe(false);
    expect(ok({ ...roleOnly, firstName: "Ana", expectedFirstName: null, expectedLastName: null })).toBe(false);
  });
});

describe("roleInputSchema and idInputSchema", () => {
  it("accept a UUID and a panel role", () => {
    expect(roleInputSchema.parse({ id: UUID, role: "admin" })).toEqual({ id: UUID, role: "admin" });
    expect(idInputSchema.parse({ id: UUID })).toEqual({ id: UUID });
  });

  it("reject ids that are not UUIDs", () => {
    expect(roleInputSchema.safeParse({ id: "row-1", role: "user" }).success).toBe(false);
    expect(idInputSchema.safeParse({ id: "1 or 1=1" }).success).toBe(false);
  });

  it("reject extra keys and the superadmin role", () => {
    expect(roleInputSchema.safeParse({ id: UUID, role: "superadmin" }).success).toBe(false);
    expect(roleInputSchema.safeParse({ id: UUID, role: "user", status: "active" }).success).toBe(false);
    expect(idInputSchema.safeParse({ id: UUID, clerkUserId: "user_1" }).success).toBe(false);
  });
});

describe("recoverInputSchema", () => {
  const ok = (payload: object) => recoverInputSchema.safeParse(payload).success;

  it("accepts id alone and identityVerified true or false", () => {
    expect(recoverInputSchema.parse({ id: UUID })).toEqual({ id: UUID });
    expect(ok({ id: UUID, identityVerified: true })).toBe(true);
    expect(ok({ id: UUID, identityVerified: false })).toBe(true);
  });

  it("rejects a non-uuid or missing id", () => {
    expect(ok({ id: "row-1" })).toBe(false);
    expect(ok({ identityVerified: true })).toBe(false);
  });

  it("rejects a non-boolean identityVerified", () => {
    expect(ok({ id: UUID, identityVerified: "true" })).toBe(false);
    expect(ok({ id: UUID, identityVerified: 1 })).toBe(false);
    expect(ok({ id: UUID, identityVerified: null })).toBe(false);
  });

  it("rejects extra keys such as clerkUserId or role", () => {
    expect(ok({ id: UUID, clerkUserId: "user_1" })).toBe(false);
    expect(ok({ id: UUID, role: "admin" })).toBe(false);
  });
});

describe("deleteUserInputSchema", () => {
  const ok = (payload: object) => deleteUserInputSchema.safeParse(payload).success;

  it("accepts a uuid and an email, normalizing case and spaces", () => {
    expect(deleteUserInputSchema.parse({ id: UUID, email: "  Ana@Example.COM " })).toEqual({
      id: UUID,
      email: "ana@example.com",
    });
  });

  it("rejects a non-uuid id, an invalid email and one over 254 characters", () => {
    expect(ok({ id: "row-1", email: "a@b.com" })).toBe(false);
    expect(ok({ id: UUID, email: "no-es-correo" })).toBe(false);
    expect(ok({ id: UUID, email: `${"a".repeat(250)}@x.com` })).toBe(false);
  });

  it("rejects extra and missing keys", () => {
    expect(ok({ id: UUID, email: "a@b.com", role: "user" })).toBe(false);
    expect(ok({ id: UUID })).toBe(false);
  });
});
