import { describe, expect, it } from "vitest";
import { idInputSchema, inviteInputSchema, roleInputSchema, usersQuerySchema } from "./users.schema";

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
