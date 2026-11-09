import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClerkAPIResponseError } from "@clerk/nextjs/errors";

const { sqlMock, clerk } = vi.hoisted(() => {
  const sqlMock = Object.assign(vi.fn(), { unsafe: (raw: string) => ({ raw }) });
  const clerk = {
    invitations: { createInvitation: vi.fn(), revokeInvitation: vi.fn() },
    users: { getUserList: vi.fn() },
    sessions: { getSessionList: vi.fn() },
  };
  return { sqlMock, clerk };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => sqlMock }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => clerk }));

import type { Actor } from "@/lib/auth";
import type { Role } from "@/lib/roles";
import type { SortKey, UsersQuery } from "../types/users.types";
import {
  activateUser,
  changeUserRole,
  countActiveSessions,
  getClerkActivity,
  inviteUser,
  listUsers,
  resendInvitation,
  revokeUser,
  UsersError,
} from "./users.service";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const ROW_ID = "22222222-2222-4222-8222-222222222222";
const REDIRECT = "https://app.example.com/sign-up";
const R12 =
  "not (role = 'superadmin' and status = 'active' and (select count(*) from app_users where role = 'superadmin' and status = 'active') <= 1)";

const actorWith = (role: Role): Actor => ({ id: ACTOR_ID, clerkUserId: "user_actor", email: "actor@example.com", role });
const SUPER = actorWith("superadmin");
const ADMIN = actorWith("admin");
const USER = actorWith("user");

type Call = unknown[];
const isRaw = (value: unknown): value is { raw: string } =>
  typeof value === "object" && value !== null && "raw" in value;

// Tagged-template call -> SQL text with raw fragments inlined and parameters as `$`.
const sqlText = (call: Call) =>
  (call[0] as string[])
    .reduce((text, part, i) => {
      const value = call[i];
      return i === 0 ? part : text + (isRaw(value) ? value.raw : "$") + part;
    }, "")
    .replace(/\s+/g, " ")
    .trim();
const params = (call: Call) => call.slice(1).filter((value) => !isRaw(value));
const sqlCalls = () => sqlMock.mock.calls as Call[];
const writes = () => sqlCalls().filter((call) => /^(update|insert|delete)\b/.test(sqlText(call)));

const clerkError = (status: number) => new ClerkAPIResponseError("clerk", { data: [], status });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  clerk.invitations.createInvitation.mockResolvedValue({ id: "inv_new" });
  clerk.invitations.revokeInvitation.mockResolvedValue({});
});

describe("permissions", () => {
  it.each([
    ["listUsers", () => listUsers(USER, { q: "", status: "all", role: "all", sort: "name", page: 1 })],
    ["countActiveSessions", () => countActiveSessions(USER, { id: ROW_ID })],
    ["inviteUser", () => inviteUser(USER, { email: "a@b.com", role: "user" }, REDIRECT)],
    ["changeUserRole", () => changeUserRole(USER, { id: ROW_ID, role: "admin" })],
    ["revokeUser", () => revokeUser(USER, { id: ROW_ID })],
    ["activateUser", () => activateUser(USER, { id: ROW_ID })],
    ["resendInvitation", () => resendInvitation(USER, { id: ROW_ID }, REDIRECT)],
  ])("%s rejects an actor without users:manage before touching the database or Clerk", async (_, run) => {
    await expect(run()).rejects.toBeInstanceOf(UsersError);
    expect(sqlMock).not.toHaveBeenCalled();
    expect(clerk.invitations.createInvitation).not.toHaveBeenCalled();
    expect(clerk.invitations.revokeInvitation).not.toHaveBeenCalled();
  });
});

describe("listUsers (CA-47, CA-49)", () => {
  const query = (overrides: Partial<UsersQuery> = {}): UsersQuery => ({
    q: "",
    status: "all",
    role: "all",
    sort: "name",
    page: 1,
    ...overrides,
  });

  const dbRow = (n: number, clerkUserId: string | null) => ({
    total: 20,
    page: 3,
    id: `row-${n}`,
    email: `u${n}@example.com`,
    first_name: `Nombre${n}`,
    last_name: null,
    role: "user",
    status: clerkUserId ? "active" : "invited",
    clerk_user_id: clerkUserId,
    created_at: new Date("2026-11-01T10:00:00Z"),
    position: n,
  });

  it("runs exactly one parameterized statement with limit 8, least() on the filtered count and the page as a parameter", async () => {
    sqlMock.mockResolvedValueOnce([]);

    await listUsers(SUPER, query({ q: "50%_a\\b", status: "active", role: "admin", page: 9 }));

    expect(sqlMock).toHaveBeenCalledTimes(1);
    const call = sqlCalls()[0];
    const text = sqlText(call);
    expect(text).toMatch(/^with filtered as \(/);
    expect(text).toContain("limit 8 offset (p.page - 1) * 8");
    expect(text).toContain("select count(*)::int as total, least($::int, greatest(ceil(count(*) / 8.0)::int, 1)) as page from filtered");
    expect(text).toContain("order by f.position");
    expect(text).not.toMatch(/50|admin'|active'/);
    expect(params(call)).toEqual([
      "active",
      "active",
      "admin",
      "admin",
      "50%_a\\b",
      "%50\\%\\_a\\\\b%",
      "%50\\%\\_a\\\\b%",
      "%50\\%\\_a\\\\b%",
      "%50\\%\\_a\\\\b%",
      9,
    ]);
    expect(text.match(/ilike \$ escape '\\'/g)).toHaveLength(4);
  });

  it.each([
    ["name", "lower(coalesce(nullif(concat_ws(' ', first_name, last_name), ''), email)) asc"],
    ["-name", "lower(coalesce(nullif(concat_ws(' ', first_name, last_name), ''), email)) desc"],
    ["email", "email asc"],
    ["-created", "created_at desc"],
  ] as [SortKey, string][])("orders %s with the closed-map fragment and id as tie-breaker", async (sort, fragment) => {
    sqlMock.mockResolvedValueOnce([]);

    await listUsers(ADMIN, query({ sort }));

    const text = sqlText(sqlCalls()[0]);
    expect(text).toContain(`row_number() over (order by ${fragment}, id) as position`);
    expect(text).toContain(`order by ${fragment}, id limit 8`);
  });

  it("maps the single empty row of a zero total to page 1 without rows", async () => {
    sqlMock.mockResolvedValueOnce([
      { total: 0, page: 1, id: null, email: null, first_name: null, last_name: null, role: null, status: null, clerk_user_id: null, created_at: null },
    ]);

    expect(await listUsers(SUPER, query({ page: 4 }))).toEqual({
      page: { rows: [], total: 0, page: 1, pageCount: 1 },
      clerkUserIds: {},
    });
  });

  it("returns the clamped page from the database and keeps Clerk ids out of the rows", async () => {
    sqlMock.mockResolvedValueOnce([dbRow(17, "user_17"), dbRow(18, null)]);

    const listing = await listUsers(SUPER, query({ page: 9 }));

    expect(listing.page.page).toBe(3);
    expect(listing.page.pageCount).toBe(3);
    expect(listing.page.total).toBe(20);
    expect(listing.page.rows).toEqual([
      {
        id: "row-17",
        email: "u17@example.com",
        firstName: "Nombre17",
        lastName: null,
        role: "user",
        status: "active",
        linked: true,
        createdAt: "2026-11-01T10:00:00.000Z",
      },
      {
        id: "row-18",
        email: "u18@example.com",
        firstName: "Nombre18",
        lastName: null,
        role: "user",
        status: "invited",
        linked: false,
        createdAt: "2026-11-01T10:00:00.000Z",
      },
    ]);
    expect(listing.clerkUserIds).toEqual({ "row-17": "user_17" });
    expect(JSON.stringify(listing.page)).not.toContain("user_17");
  });
});

describe("getClerkActivity (CA-49)", () => {
  it("does not call Clerk without ids", async () => {
    expect(await getClerkActivity({})).toEqual({});
    expect(clerk.users.getUserList).not.toHaveBeenCalled();
  });

  it("makes one getUserList call with every id and keys the result by row id", async () => {
    clerk.users.getUserList.mockResolvedValueOnce({
      data: [
        { id: "user_a", lastSignInAt: 1000, hasImage: true, imageUrl: "https://img/a" },
        { id: "user_b", lastSignInAt: null, hasImage: false, imageUrl: "https://img/default" },
      ],
      totalCount: 2,
    });

    const activity = await getClerkActivity({ "row-a": "user_a", "row-b": "user_b" });

    expect(clerk.users.getUserList).toHaveBeenCalledTimes(1);
    expect(clerk.users.getUserList).toHaveBeenCalledWith({ userId: ["user_a", "user_b"], limit: 2 });
    expect(activity).toEqual({
      "row-a": { lastSignInAt: 1000, imageUrl: "https://img/a" },
      "row-b": { lastSignInAt: null, imageUrl: null },
    });
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("returns {} without throwing when Clerk fails", async () => {
    clerk.users.getUserList.mockRejectedValueOnce(new Error("down"));
    expect(await getClerkActivity({ "row-a": "user_a" })).toEqual({});
  });
});

describe("countActiveSessions (CA-49)", () => {
  it("reads the Clerk id by row id on the server and counts active sessions", async () => {
    sqlMock.mockResolvedValueOnce([{ clerk_user_id: "user_x" }]);
    clerk.sessions.getSessionList.mockResolvedValueOnce({ data: [], totalCount: 2 });

    expect(await countActiveSessions(ADMIN, { id: ROW_ID })).toBe(2);
    expect(params(sqlCalls()[0])).toEqual([ROW_ID]);
    expect(clerk.sessions.getSessionList).toHaveBeenCalledWith({ userId: "user_x", status: "active" });
    expect(writes()).toHaveLength(0);
  });

  it("returns null without a Clerk id and does not call Clerk", async () => {
    sqlMock.mockResolvedValueOnce([{ clerk_user_id: null }]);
    expect(await countActiveSessions(ADMIN, { id: ROW_ID })).toBeNull();
    expect(clerk.sessions.getSessionList).not.toHaveBeenCalled();
  });

  it("returns null when Clerk fails", async () => {
    sqlMock.mockResolvedValueOnce([{ clerk_user_id: "user_x" }]);
    clerk.sessions.getSessionList.mockRejectedValueOnce(new Error("down"));
    expect(await countActiveSessions(ADMIN, { id: ROW_ID })).toBeNull();
    expect(writes()).toHaveLength(0);
  });
});

describe("inviteUser (CA-13, CA-18)", () => {
  const INVITE = { email: "nuevo@example.com", role: "user" as const };

  it("admin invites a user: lookup, Clerk, then the insert with on conflict do nothing", async () => {
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: ROW_ID }]);

    await inviteUser(ADMIN, INVITE, REDIRECT);

    expect(clerk.invitations.createInvitation).toHaveBeenCalledWith({
      emailAddress: "nuevo@example.com",
      redirectUrl: REDIRECT,
      notify: true,
      ignoreExisting: true,
    });
    const insert = sqlCalls()[1];
    expect(sqlText(insert)).toBe(
      "insert into app_users (email, role, status, invitation_id) values ($, $, 'invited', $) on conflict (email) do nothing returning id",
    );
    expect(params(insert)).toEqual(["nuevo@example.com", "user", "inv_new"]);
    expect(clerk.invitations.createInvitation.mock.invocationCallOrder[0]).toBeLessThan(
      sqlMock.mock.invocationCallOrder[1],
    );
  });

  it.each(["admin", "superadmin"] as const)("admin inviting %s throws without Clerk or database", async (role) => {
    await expect(inviteUser(ADMIN, { ...INVITE, role: role as "admin" }, REDIRECT)).rejects.toBeInstanceOf(UsersError);
    expect(sqlMock).not.toHaveBeenCalled();
    expect(clerk.invitations.createInvitation).not.toHaveBeenCalled();
  });

  it("superadmin invites admin but never superadmin", async () => {
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: ROW_ID }]);
    await inviteUser(SUPER, { ...INVITE, role: "admin" }, REDIRECT);
    expect(params(sqlCalls()[1])).toEqual(["nuevo@example.com", "admin", "inv_new"]);

    vi.clearAllMocks();
    await expect(
      inviteUser(SUPER, { ...INVITE, role: "superadmin" as "admin" }, REDIRECT),
    ).rejects.toBeInstanceOf(UsersError);
    expect(sqlMock).not.toHaveBeenCalled();
    expect(clerk.invitations.createInvitation).not.toHaveBeenCalled();
  });

  it.each([
    ["invited", "Ya tiene una invitación pendiente. Usa Reenviar invitación."],
    ["active", "Esa persona ya tiene acceso."],
    ["revoked", "Ese correo fue inactivado y no puede invitarse de nuevo."],
  ])("an existing %s row fails without Clerk and without insert", async (status, message) => {
    sqlMock.mockResolvedValueOnce([{ status }]);

    await expect(inviteUser(SUPER, INVITE, REDIRECT)).rejects.toThrow(new UsersError(message));
    expect(clerk.invitations.createInvitation).not.toHaveBeenCalled();
    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(writes()).toHaveLength(0);
  });

  it("does not insert when Clerk fails", async () => {
    sqlMock.mockResolvedValueOnce([]);
    clerk.invitations.createInvitation.mockRejectedValueOnce(new Error("clerk down"));

    await expect(inviteUser(SUPER, INVITE, REDIRECT)).rejects.toThrow("clerk down");
    expect(writes()).toHaveLength(0);
  });

  it("revokes the new invitation when the insert returns no row", async () => {
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(inviteUser(SUPER, INVITE, REDIRECT)).rejects.toThrow(new UsersError("Ese correo ya está registrado."));
    expect(clerk.invitations.revokeInvitation).toHaveBeenCalledWith("inv_new");
  });

  it("revokes the new invitation when the insert fails, and still reports the conflict if that revoke fails", async () => {
    sqlMock.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("db down"));
    await expect(inviteUser(SUPER, INVITE, REDIRECT)).rejects.toThrow("db down");
    expect(clerk.invitations.revokeInvitation).toHaveBeenCalledWith("inv_new");

    vi.clearAllMocks();
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    clerk.invitations.revokeInvitation.mockRejectedValueOnce(clerkError(500));
    await expect(inviteUser(SUPER, INVITE, REDIRECT)).rejects.toThrow("Ese correo ya está registrado.");
    expect(console.error).toHaveBeenCalledWith("users.service: compensating revoke failed", expect.any(Object));
  });
});

describe("changeUserRole (CA-14, CA-19)", () => {
  it("superadmin changes user <-> admin in one statement with every condition and R12", async () => {
    sqlMock.mockResolvedValueOnce([{ id: ROW_ID }]);

    await changeUserRole(SUPER, { id: ROW_ID, role: "admin" });

    expect(sqlMock).toHaveBeenCalledTimes(1);
    const call = sqlCalls()[0];
    expect(sqlText(call)).toBe(
      `update app_users set role = $, updated_at = now() where id = $ and id <> $ and role in ('user', 'admin') and status <> 'revoked' and role is distinct from $ and ${R12} returning id`,
    );
    expect(params(call)).toEqual(["admin", ROW_ID, ACTOR_ID, "admin"]);
  });

  it.each([
    ["an admin", () => changeUserRole(ADMIN, { id: ROW_ID, role: "user" })],
    ["the own row", () => changeUserRole(SUPER, { id: ACTOR_ID, role: "user" })],
    ["the superadmin role", () => changeUserRole(SUPER, { id: ROW_ID, role: "superadmin" as "admin" })],
  ])("%s throws without update", async (_, run) => {
    await expect(run()).rejects.toBeInstanceOf(UsersError);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("a superadmin row (excluded by the statement) or a stale row gives zero rows and throws", async () => {
    sqlMock.mockResolvedValueOnce([]);
    await expect(changeUserRole(SUPER, { id: ROW_ID, role: "user" })).rejects.toThrow(
      new UsersError("No se pudo cambiar el rol. Recarga la página."),
    );
    // The guard lives in the single update: no prior read, and the statement excludes superadmin rows.
    expect(writes()).toHaveLength(1);
    expect(sqlText(writes()[0])).toContain("role in ('user', 'admin')");
  });
});

describe("revokeUser (CA-15, CA-19)", () => {
  const stored = (overrides: Record<string, unknown> = {}) => ({
    role: "user",
    status: "invited",
    invitation_id: "inv_x",
    email: "u@example.com",
    linked: false,
    ...overrides,
  });

  it("invited row: revokes the read invitation in Clerk before a conditional update with R12", async () => {
    sqlMock.mockResolvedValueOnce([stored()]).mockResolvedValueOnce([{ id: ROW_ID }]);

    await revokeUser(ADMIN, { id: ROW_ID });

    expect(clerk.invitations.revokeInvitation).toHaveBeenCalledWith("inv_x");
    const update = sqlCalls()[1];
    expect(sqlText(update)).toBe(
      `update app_users set status = 'revoked', updated_at = now() where id = $ and status = $ and invitation_id is not distinct from $ and id <> $ and role = any($) and ${R12} returning id`,
    );
    expect(params(update)).toEqual([ROW_ID, "invited", "inv_x", ACTOR_ID, ["user"]]);
    expect(clerk.invitations.revokeInvitation.mock.invocationCallOrder[0]).toBeLessThan(
      sqlMock.mock.invocationCallOrder[1],
    );
  });

  it("a Clerk 404 counts as done", async () => {
    sqlMock.mockResolvedValueOnce([stored()]).mockResolvedValueOnce([{ id: ROW_ID }]);
    clerk.invitations.revokeInvitation.mockRejectedValueOnce(clerkError(404));

    await revokeUser(SUPER, { id: ROW_ID });
    expect(writes()).toHaveLength(1);
  });

  it.each([
    ["a Clerk 400", clerkError(400)],
    ["a Clerk 500", clerkError(500)],
    ["a network error", new Error("network")],
  ])("%s aborts without update", async (_, error) => {
    sqlMock.mockResolvedValueOnce([stored()]);
    clerk.invitations.revokeInvitation.mockRejectedValueOnce(error);

    await expect(revokeUser(SUPER, { id: ROW_ID })).rejects.toBe(error);
    expect(writes()).toHaveLength(0);
  });

  it("active row: no Clerk call, update conditioned on the read state", async () => {
    sqlMock.mockResolvedValueOnce([stored({ status: "active", invitation_id: null, linked: true, role: "admin" })]);
    sqlMock.mockResolvedValueOnce([{ id: ROW_ID }]);

    await revokeUser(SUPER, { id: ROW_ID });

    expect(clerk.invitations.revokeInvitation).not.toHaveBeenCalled();
    expect(params(sqlCalls()[1])).toEqual([ROW_ID, "active", null, ACTOR_ID, ["user", "admin"]]);
  });

  it("concurrent resend: zero rows throws without more writes and only X was revoked", async () => {
    sqlMock.mockResolvedValueOnce([stored({ invitation_id: "inv_X" })]).mockResolvedValueOnce([]);

    await expect(revokeUser(SUPER, { id: ROW_ID })).rejects.toThrow(
      new UsersError("El usuario cambió mientras tanto. Recarga la página."),
    );
    expect(clerk.invitations.revokeInvitation).toHaveBeenCalledTimes(1);
    expect(clerk.invitations.revokeInvitation).toHaveBeenCalledWith("inv_X");
    expect(writes()).toHaveLength(1);
  });

  it.each([
    ["a superadmin row", SUPER, stored({ role: "superadmin", status: "active" })],
    ["an admin row for an admin", ADMIN, stored({ role: "admin" })],
  ])("%s throws before Clerk and without update", async (_, actor, row) => {
    sqlMock.mockResolvedValueOnce([row]);

    await expect(revokeUser(actor, { id: ROW_ID })).rejects.toBeInstanceOf(UsersError);
    expect(clerk.invitations.revokeInvitation).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });

  it("the own row throws without update", async () => {
    sqlMock.mockResolvedValueOnce([stored({ status: "active", role: "user" })]);
    await expect(revokeUser(SUPER, { id: ACTOR_ID })).rejects.toBeInstanceOf(UsersError);
    expect(writes()).toHaveLength(0);
  });
});

describe("activateUser (CA-46, CA-19)", () => {
  it("runs a single update for revoked linked manageable rows with R12, without Clerk", async () => {
    sqlMock.mockResolvedValueOnce([{ id: ROW_ID }]);

    await activateUser(ADMIN, { id: ROW_ID });

    expect(sqlMock).toHaveBeenCalledTimes(1);
    const call = sqlCalls()[0];
    expect(sqlText(call)).toBe(
      `update app_users set status = 'active', updated_at = now() where id = $ and status = 'revoked' and clerk_user_id is not null and id <> $ and role = any($) and ${R12} returning id`,
    );
    expect(params(call)).toEqual([ROW_ID, ACTOR_ID, ["user"]]);
    expect(clerk.invitations.createInvitation).not.toHaveBeenCalled();
    expect(clerk.invitations.revokeInvitation).not.toHaveBeenCalled();
  });

  it("zero rows (e.g. a revoked invitation never accepted) throws", async () => {
    sqlMock.mockResolvedValueOnce([]);
    await expect(activateUser(SUPER, { id: ROW_ID })).rejects.toThrow(
      new UsersError("Solo se puede activar a quien ya había entrado al panel."),
    );
  });
});

describe("resendInvitation (CA-13)", () => {
  const stored = (overrides: Record<string, unknown> = {}) => ({
    role: "user",
    status: "invited",
    invitation_id: "inv_old",
    email: "u@example.com",
    linked: false,
    ...overrides,
  });

  it("revokes the old one, creates a new one, then a conditional update", async () => {
    sqlMock.mockResolvedValueOnce([stored()]).mockResolvedValueOnce([{ id: ROW_ID }]);

    await resendInvitation(ADMIN, { id: ROW_ID }, REDIRECT);

    expect(clerk.invitations.revokeInvitation).toHaveBeenCalledWith("inv_old");
    expect(clerk.invitations.createInvitation).toHaveBeenCalledWith({
      emailAddress: "u@example.com",
      redirectUrl: REDIRECT,
      notify: true,
      ignoreExisting: true,
    });
    const update = sqlCalls()[1];
    expect(sqlText(update)).toBe(
      "update app_users set invitation_id = $, updated_at = now() where id = $ and status = 'invited' and invitation_id is not distinct from $ and role = any($) returning id",
    );
    expect(params(update)).toEqual(["inv_new", ROW_ID, "inv_old", ["user"]]);

    const revokeAt = clerk.invitations.revokeInvitation.mock.invocationCallOrder[0];
    const createAt = clerk.invitations.createInvitation.mock.invocationCallOrder[0];
    expect(revokeAt).toBeLessThan(createAt);
    expect(createAt).toBeLessThan(sqlMock.mock.invocationCallOrder[1]);
  });

  it("does not update when Clerk fails to create", async () => {
    sqlMock.mockResolvedValueOnce([stored()]);
    clerk.invitations.createInvitation.mockRejectedValueOnce(new Error("clerk down"));

    await expect(resendInvitation(SUPER, { id: ROW_ID }, REDIRECT)).rejects.toThrow("clerk down");
    expect(writes()).toHaveLength(0);
  });

  it("concurrent change: zero rows revokes the new invitation and throws without more writes", async () => {
    sqlMock.mockResolvedValueOnce([stored()]).mockResolvedValueOnce([]);

    await expect(resendInvitation(SUPER, { id: ROW_ID }, REDIRECT)).rejects.toThrow(
      new UsersError("El usuario cambió mientras tanto. Recarga la página."),
    );
    expect(clerk.invitations.revokeInvitation).toHaveBeenLastCalledWith("inv_new");
    expect(writes()).toHaveLength(1);
  });

  it.each([
    ["an active row", ADMIN, stored({ status: "active" })],
    ["an admin row for an admin", ADMIN, stored({ role: "admin" })],
    ["a superadmin row", SUPER, stored({ role: "superadmin" })],
  ])("%s throws without Clerk or update", async (_, actor, row) => {
    sqlMock.mockResolvedValueOnce([row]);

    await expect(resendInvitation(actor, { id: ROW_ID }, REDIRECT)).rejects.toBeInstanceOf(UsersError);
    expect(clerk.invitations.revokeInvitation).not.toHaveBeenCalled();
    expect(clerk.invitations.createInvitation).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });
});

describe("module source (CA-15, R48)", () => {
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? sourceFiles(path) : /\.test\.tsx?$/.test(name) ? [] : [path];
    });

  it("no non-test file deletes rows or Clerk objects", () => {
    for (const file of sourceFiles(join(process.cwd(), "modules/users"))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/delete from|deleteUser|deleteInvitation/i);
    }
  });
});
