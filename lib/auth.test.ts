import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, currentUserMock, redirectMock, sqlMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  currentUserMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
  sqlMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock, currentUser: currentUserMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/db", () => ({ getDb: () => sqlMock }));

import { getActor, requirePermission, syncOwnIdentity } from "./auth";

const CLERK_ID = "user_123";

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "row-1",
  clerk_user_id: CLERK_ID,
  email: "ana@example.com",
  role: "user",
  status: "active",
  ...overrides,
});

const clerkUser = (status = "verified", role = "superadmin") => ({
  id: CLERK_ID,
  firstName: "Ana",
  lastName: "López",
  publicMetadata: { role },
  primaryEmailAddress: { emailAddress: "Ana@Example.com", verification: { status } },
});

// Tagged-template call -> normalized SQL text.
const sqlText = (call: unknown[]) => (call[0] as string[]).join("$").replace(/\s+/g, " ");

function signedIn(userId: string | null = CLERK_ID) {
  authMock.mockResolvedValue({ userId });
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUserMock.mockResolvedValue(clerkUser());
});

describe("getActor", () => {
  it("returns null without a session and touches nothing", async () => {
    signedIn(null);
    expect(await getActor()).toBeNull();
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("returns the actor for a linked active row", async () => {
    signedIn();
    sqlMock.mockResolvedValueOnce([row()]);

    expect(await getActor()).toEqual({
      id: "row-1",
      clerkUserId: CLERK_ID,
      email: "ana@example.com",
      role: "user",
    });
    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(sqlMock.mock.calls[0].slice(1)).toEqual([CLERK_ID]);
  });

  it.each(["revoked", "invited"])("returns null for a linked %s row without updating", async (status) => {
    signedIn();
    sqlMock.mockResolvedValueOnce([row({ status })]);

    expect(await getActor()).toBeNull();
    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(currentUserMock).not.toHaveBeenCalled();
  });

  it("links an invited unlinked row by verified email in one atomic update", async () => {
    signedIn();
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([row({ role: "admin" })]);

    expect(await getActor()).toEqual({
      id: "row-1",
      clerkUserId: CLERK_ID,
      email: "ana@example.com",
      role: "admin",
    });

    expect(sqlMock).toHaveBeenCalledTimes(2);
    const update = sqlMock.mock.calls[1];
    expect(sqlText(update)).toMatch(
      /^ update app_users set clerk_user_id = \$, status = 'active', first_name = \$, last_name = \$, updated_at = now\(\) where email = \$ and status = 'invited' and clerk_user_id is null returning /,
    );
    expect(update.slice(1)).toEqual([CLERK_ID, "Ana", "López", "ana@example.com"]);
  });

  it("links with null names when Clerk has none (D32)", async () => {
    signedIn();
    currentUserMock.mockResolvedValue({ ...clerkUser(), firstName: null, lastName: undefined });
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([row()]);

    expect(await getActor()).not.toBeNull();
    expect(sqlMock.mock.calls[1].slice(1)).toEqual([CLERK_ID, null, null, "ana@example.com"]);
  });

  it("returns null for a revoked unlinked row with the same email: the update guard excludes it", async () => {
    signedIn();
    // The revoked row does not match `status = 'invited'`, so the update affects nothing.
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    expect(await getActor()).toBeNull();
    expect(sqlMock).toHaveBeenCalledTimes(2);
    expect(sqlText(sqlMock.mock.calls[1])).toContain("and status = 'invited' and clerk_user_id is null");
  });

  it.each(["unverified", "expired"])("returns null for a %s email without updating", async (status) => {
    signedIn();
    currentUserMock.mockResolvedValue(clerkUser(status));
    sqlMock.mockResolvedValueOnce([]);

    expect(await getActor()).toBeNull();
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("returns null without a primary email without updating", async () => {
    signedIn();
    currentUserMock.mockResolvedValue({ ...clerkUser(), primaryEmailAddress: null });
    sqlMock.mockResolvedValueOnce([]);

    expect(await getActor()).toBeNull();
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when no row exists for the user", async () => {
    signedIn();
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    expect(await getActor()).toBeNull();
  });

  it("reads the role from the database even if publicMetadata.role says otherwise", async () => {
    signedIn();
    currentUserMock.mockResolvedValue(clerkUser("verified", "superadmin"));
    sqlMock.mockResolvedValueOnce([row({ role: "user" })]);

    expect((await getActor())?.role).toBe("user");
  });
});

describe("requirePermission", () => {
  it("redirects to /sign-in without a session", async () => {
    signedIn(null);
    await expect(requirePermission("dashboard:view")).rejects.toThrow("REDIRECT /sign-in");
  });

  it("redirects to / without an active row", async () => {
    signedIn();
    sqlMock.mockResolvedValueOnce([row({ status: "revoked" })]);
    await expect(requirePermission("dashboard:view")).rejects.toThrow("REDIRECT /");
    expect(redirectMock).toHaveBeenCalledWith("/");
  });

  it("redirects to / without any row", async () => {
    signedIn();
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(requirePermission("dashboard:view")).rejects.toThrow("REDIRECT /");
    expect(redirectMock).toHaveBeenCalledWith("/");
  });

  it("redirects to / without the permission, ignoring publicMetadata", async () => {
    signedIn();
    currentUserMock.mockResolvedValue(clerkUser("verified", "superadmin"));
    sqlMock.mockResolvedValueOnce([row({ role: "user" })]);
    await expect(requirePermission("users:manage")).rejects.toThrow("REDIRECT /");
    expect(redirectMock).toHaveBeenCalledWith("/");
  });

  it("returns the actor when the role has the permission", async () => {
    signedIn();
    sqlMock.mockResolvedValueOnce([row({ role: "admin" })]);
    expect(await requirePermission("users:manage")).toMatchObject({ role: "admin" });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("syncOwnIdentity", () => {
  const actor = { id: "row-1", clerkUserId: CLERK_ID, email: "old@example.com", role: "user" as const };
  const namesCall = () => sqlMock.mock.calls.find((call) => sqlText(call).includes("set first_name"));
  const emailCall = () => sqlMock.mock.calls.find((call) => sqlText(call).includes("set email"));

  beforeEach(() => {
    sqlMock.mockResolvedValue([]);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("updates names and email of the actor's own row in two separate statements", async () => {
    await syncOwnIdentity(actor);

    expect(sqlMock).toHaveBeenCalledTimes(2);
    const names = namesCall()!;
    const email = emailCall()!;
    expect(sqlText(names)).toMatch(
      /^ update app_users set first_name = \$, last_name = \$, updated_at = now\(\) where id = \$ and \(first_name is distinct from \$ or last_name is distinct from \$\)\s*$/,
    );
    expect(names.slice(1)).toEqual(["Ana", "López", "row-1", "Ana", "López"]);
    expect(sqlText(email)).toMatch(
      /^ update app_users set email = \$, updated_at = now\(\) where id = \$ and email is distinct from \$ and not exists \(select 1 from app_users where email = \$ and id <> \$\)\s*$/,
    );
    expect(email.slice(1)).toEqual(["ana@example.com", "row-1", "ana@example.com", "ana@example.com", "row-1"]);
    // Names first, then email; neither statement writes the other's columns.
    expect(sqlMock.mock.calls.indexOf(names)).toBeLessThan(sqlMock.mock.calls.indexOf(email));
    expect(sqlText(email)).not.toMatch(/first_name|last_name/);
    expect(sqlText(names)).not.toMatch(/email/);
  });

  it("never writes role, status, clerk_user_id or invitation_id", async () => {
    await syncOwnIdentity(actor);
    for (const call of sqlMock.mock.calls) {
      expect(sqlText(call)).not.toMatch(/\b(role|status|clerk_user_id|invitation_id)\b/);
    }
  });

  it.each(["unverified", "expired"])("does not change the email when the primary is %s", async (status) => {
    currentUserMock.mockResolvedValue(clerkUser(status));
    await syncOwnIdentity(actor);

    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(namesCall()).toBeDefined();
    expect(emailCall()).toBeUndefined();
  });

  it("does not change the email without a primary email", async () => {
    currentUserMock.mockResolvedValue({ ...clerkUser(), primaryEmailAddress: null });
    await syncOwnIdentity(actor);

    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(emailCall()).toBeUndefined();
  });

  it("keeps the email when another row uses it (not exists guard) and still updates the names", async () => {
    // Collision handled by the statement itself: zero rows affected, no error.
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(syncOwnIdentity(actor)).resolves.toBeUndefined();

    expect(namesCall()!.slice(1)).toContain("row-1");
    expect(sqlText(emailCall()!)).toContain("not exists (select 1 from app_users where email = $ and id <> $)");
  });

  it("concurrency: a 23505 on the email statement is logged, does not throw and the names already ran", async () => {
    sqlMock
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(Object.assign(new Error("duplicate key value"), { code: "23505", detail: "secret" }));

    await expect(syncOwnIdentity(actor)).resolves.toBeUndefined();

    expect(sqlMock).toHaveBeenCalledTimes(2);
    expect(sqlMock.mock.calls[0]).toBe(namesCall());
    expect(namesCall()!.slice(1)).toContain("row-1");
    expect(console.error).toHaveBeenCalledWith("syncOwnIdentity: email update failed", {
      code: "23505",
      message: "duplicate key value",
    });
  });

  it("does not throw when the names statement fails, and still tries the email", async () => {
    sqlMock.mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce([]);
    await expect(syncOwnIdentity(actor)).resolves.toBeUndefined();
    expect(emailCall()).toBeDefined();
  });

  it("does not throw when Clerk fails, and touches nothing", async () => {
    currentUserMock.mockRejectedValue(new Error("clerk down"));
    await expect(syncOwnIdentity(actor)).resolves.toBeUndefined();
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("touches nothing without a Clerk user or when it is not the actor's", async () => {
    currentUserMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...clerkUser(), id: "user_other" });
    await syncOwnIdentity(actor);
    await syncOwnIdentity(actor);
    expect(sqlMock).not.toHaveBeenCalled();
  });
});
