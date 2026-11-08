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

import { getActor, requirePermission } from "./auth";

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
      /^ update app_users set clerk_user_id = \$, status = 'active', updated_at = now\(\) where email = \$ and status = 'invited' and clerk_user_id is null returning /,
    );
    expect(update.slice(1)).toEqual([CLERK_ID, "ana@example.com"]);
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
