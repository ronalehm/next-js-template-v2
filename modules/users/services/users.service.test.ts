import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClerkAPIResponseError } from "@clerk/nextjs/errors";

const { sqlMock, clerk } = vi.hoisted(() => {
  const sqlMock = Object.assign(vi.fn(), { unsafe: (raw: string) => ({ raw }) });
  const clerk = {
    invitations: { createInvitation: vi.fn(), revokeInvitation: vi.fn() },
    users: { getUserList: vi.fn(), updateUser: vi.fn() },
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
import { assignableRoles } from "../utils/userPermissions";
import {
  activateUser,
  changeUserRole,
  countActiveSessions,
  getClerkActivity,
  inviteUser,
  listUsers,
  resendInvitation,
  revokeUser,
  updateUser,
  updateUserName,
  UsersError,
} from "./users.service";

const FORBIDDEN = "No tienes permiso para esta acción.";
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

const NAME_INPUT = {
  id: ROW_ID,
  firstName: "Ana María",
  lastName: "Pérez",
  expectedFirstName: "Ana",
  expectedLastName: "Perez",
};

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
    ["updateUserName", () => updateUserName(USER, NAME_INPUT)],
    ["updateUser", () => updateUser(USER, { id: ROW_ID, role: "admin", expectedRole: "user" })],
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

describe("changeUserRole (USERS-1b)", () => {
  const ROLE_FAILED = "No se pudo cambiar el rol. Recarga la página.";

  it.each([
    ["superadmin", SUPER, ["user", "admin"], true],
    ["admin", ADMIN, ["user"], false],
  ] as [string, Actor, Role[], boolean][])(
    "%s: one statement with the manageable-rows filter, both row branches, the server-computed superadmin flag and R12",
    async (_, actor, manageable, isSuper) => {
      sqlMock.mockResolvedValueOnce([{ id: ROW_ID }]);

      await changeUserRole(actor, { id: ROW_ID, role: "admin" });

      expect(sqlMock).toHaveBeenCalledTimes(1);
      const call = sqlCalls()[0];
      expect(sqlText(call)).toBe(
        `update app_users set role = $, updated_at = now() where id = $ and id <> $ and role = any($) and ((status = 'active' and clerk_user_id is not null) or ($::boolean and status = 'invited' and clerk_user_id is null)) and role is distinct from $ and ${R12} returning id`,
      );
      expect(params(call)).toEqual(["admin", ROW_ID, ACTOR_ID, manageable, isSuper, "admin"]);
    },
  );

  it.each([
    ["the own row", () => changeUserRole(SUPER, { id: ACTOR_ID, role: "user" })],
    ["the superadmin role", () => changeUserRole(SUPER, { id: ROW_ID, role: "superadmin" as "admin" })],
  ])("%s throws without SQL", async (_, run) => {
    await expect(run()).rejects.toBeInstanceOf(UsersError);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("zero rows (admin over admin/superadmin/invited, stale or already-accepted row) throws the role message", async () => {
    sqlMock.mockResolvedValueOnce([]);
    await expect(changeUserRole(ADMIN, { id: ROW_ID, role: "user" })).rejects.toThrow(new UsersError(ROLE_FAILED));
    expect(writes()).toHaveLength(1);
  });

  it("admin limits unchanged (AC-13, AC-16): assignableRoles, invite, revoke, activate and resend stay closed", async () => {
    expect(assignableRoles("admin")).toEqual(["user"]);

    await expect(inviteUser(ADMIN, { email: "a@b.com", role: "admin" }, REDIRECT)).rejects.toThrow(FORBIDDEN);

    for (const role of ["admin", "superadmin"] as const) {
      vi.clearAllMocks();
      sqlMock.mockResolvedValueOnce([{ role, status: "invited", invitation_id: "inv_x", email: "u@b.com", linked: false }]);
      await expect(revokeUser(ADMIN, { id: ROW_ID })).rejects.toThrow(FORBIDDEN);
      sqlMock.mockResolvedValueOnce([{ role, status: "invited", invitation_id: "inv_x", email: "u@b.com", linked: false }]);
      await expect(resendInvitation(ADMIN, { id: ROW_ID }, REDIRECT)).rejects.toThrow(FORBIDDEN);
      sqlMock.mockResolvedValueOnce([]);
      await expect(activateUser(ADMIN, { id: ROW_ID })).rejects.toBeInstanceOf(UsersError);
      expect(params(sqlCalls().at(-1)!)).toContainEqual(["user"]);
      expect(clerk.invitations.revokeInvitation).not.toHaveBeenCalled();
      expect(clerk.invitations.createInvitation).not.toHaveBeenCalled();
    }

    vi.clearAllMocks();
    sqlMock.mockResolvedValueOnce([{ id: ROW_ID }]);
    await expect(changeUserRole(ADMIN, { id: ROW_ID, role: "admin" })).resolves.toBeUndefined();
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

describe("updateUserName (USERS-1)", () => {
  const PARTIAL =
    "El cambio se guardó solo en parte: se actualizó en la cuenta, pero no en el panel. Vuelve a intentarlo.";
  const storedRow = (overrides: Record<string, unknown> = {}) => ({
    role: "user",
    status: "active",
    clerk_user_id: "user_target",
    first_name: "Ana",
    last_name: "Perez",
    ...overrides,
  });
  const noWrites = () => {
    expect(clerk.users.updateUser).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  };

  beforeEach(() => {
    clerk.users.updateUser.mockResolvedValue({});
  });

  it.each([
    ["superadmin", SUPER, "user"],
    ["superadmin", SUPER, "admin"],
    ["admin", ADMIN, "user"],
  ] as [string, Actor, Role][])("%s edits an active linked %s: Clerk first with the row's Clerk id, then a guarded update", async (_, actor, role) => {
    sqlMock.mockResolvedValueOnce([storedRow({ role })]).mockResolvedValueOnce([{ id: ROW_ID }]);

    await expect(updateUserName(actor, NAME_INPUT)).resolves.toBeUndefined();

    expect(clerk.users.updateUser).toHaveBeenCalledTimes(1);
    expect(clerk.users.updateUser).toHaveBeenCalledWith("user_target", { firstName: "Ana María", lastName: "Pérez" });
    expect(clerk.users.updateUser.mock.invocationCallOrder[0]).toBeLessThan(sqlMock.mock.invocationCallOrder[1]);
    const text = sqlText(writes()[0]);
    expect(text).toContain("id <> $");
    expect(text).toContain("status = 'active'");
    expect(text).toContain("clerk_user_id = $");
    expect(text).toContain("first_name is not distinct from $");
    expect(text).toContain("last_name is not distinct from $");
    expect(params(writes()[0])).toEqual([
      "Ana María",
      "Pérez",
      ROW_ID,
      ACTOR_ID,
      actor.role === "superadmin" ? ["user", "admin"] : ["user"],
      "user_target",
      "Ana",
      "Perez",
    ]);
  });

  it.each([
    ["admin over admin", ADMIN, ROW_ID, "admin"],
    ["admin over superadmin", ADMIN, ROW_ID, "superadmin"],
    ["superadmin over superadmin", SUPER, ROW_ID, "superadmin"],
    ["own account", SUPER, ACTOR_ID, "user"],
  ] as [string, Actor, string, Role][])("rejects %s without Clerk or writes", async (_, actor, id, role) => {
    sqlMock.mockResolvedValueOnce([storedRow({ role })]);

    await expect(updateUserName(actor, { ...NAME_INPUT, id })).rejects.toThrow("No tienes permiso para esta acción.");
    noWrites();
  });

  it.each([
    ["missing row", null],
    ["invited", storedRow({ status: "invited" })],
    ["revoked", storedRow({ status: "revoked" })],
    ["unlinked", storedRow({ clerk_user_id: null })],
    ["different first name", storedRow({ first_name: "Otro" })],
    ["different last name", storedRow({ last_name: null })],
  ])("%s: CHANGED without Clerk or writes", async (_, row) => {
    sqlMock.mockResolvedValueOnce(row ? [row] : []);

    await expect(updateUserName(SUPER, NAME_INPUT)).rejects.toThrow("El usuario cambió mientras tanto. Recarga la página.");
    noWrites();
  });

  it("Clerk failure: no Neon write and the error propagates", async () => {
    sqlMock.mockResolvedValueOnce([storedRow()]);
    clerk.users.updateUser.mockRejectedValueOnce(clerkError(500));

    const error = await updateUserName(SUPER, NAME_INPUT).catch((e) => e);

    expect(error).not.toBeInstanceOf(UsersError);
    expect(writes()).toHaveLength(0);
  });

  it("Clerk 422: name message and no Neon write", async () => {
    sqlMock.mockResolvedValueOnce([storedRow()]);
    clerk.users.updateUser.mockRejectedValueOnce(clerkError(422));

    await expect(updateUserName(SUPER, NAME_INPUT)).rejects.toThrow(
      "No se pudo guardar: revisa el nombre y el apellido.",
    );
    expect(writes()).toHaveLength(0);
  });

  it("Neon throws after Clerk: partial message, single Clerk call, log with step and no personal data", async () => {
    sqlMock.mockResolvedValueOnce([storedRow()]).mockRejectedValueOnce(Object.assign(new Error("db down"), { code: "X1" }));

    await expect(updateUserName(SUPER, NAME_INPUT)).rejects.toThrow(PARTIAL);

    expect(clerk.users.updateUser).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith("users.service: updateUserName failed", {
      code: "X1",
      message: "db down",
      step: "neon-after-clerk",
    });
  });

  it("0 rows after Clerk: partial message (not CHANGED), single Clerk call, tagged log", async () => {
    sqlMock.mockResolvedValueOnce([storedRow()]).mockResolvedValueOnce([]);

    const error = await updateUserName(SUPER, NAME_INPUT).catch((e) => e);

    expect(error).toBeInstanceOf(UsersError);
    expect(error.message).toBe(PARTIAL);
    expect(clerk.users.updateUser).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith("users.service: updateUserName failed", {
      code: undefined,
      message: undefined,
      step: "neon-after-clerk",
    });
  });
});

describe("updateUser (USERS-1b)", () => {
  const ROLE_PARTIAL = "El nombre se guardó, pero el rol no se pudo cambiar. Recarga la página y vuelve a intentarlo.";
  const ROLE_FAILED = "No se pudo cambiar el rol. Recarga la página.";
  const CHANGED = "El usuario cambió mientras tanto. Recarga la página.";
  const storedRow = (overrides: Record<string, unknown> = {}) => ({
    role: "user",
    status: "active",
    clerk_user_id: "user_target",
    first_name: "Ana",
    last_name: "Perez",
    ...overrides,
  });
  // Full payload: name changed from NAME_INPUT's expected values; role changes only when overridden.
  const FULL = { ...NAME_INPUT, role: "user" as const, expectedRole: "user" as const };
  const ROLE_ONLY = { id: ROW_ID, role: "admin" as const, expectedRole: "user" as const };

  beforeEach(() => {
    clerk.users.updateUser.mockResolvedValue({});
  });

  it("role-only payload (invited row): only changeUserRole, no Clerk and no name read", async () => {
    sqlMock.mockResolvedValueOnce([{ id: ROW_ID }]);

    await updateUser(SUPER, ROLE_ONLY);

    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(sqlText(sqlCalls()[0])).toMatch(/^update app_users set role = \$/);
    expect(clerk.users.updateUser).not.toHaveBeenCalled();
  });

  it("full payload against an invited row: CHANGED without Clerk or writes", async () => {
    sqlMock.mockResolvedValueOnce([storedRow({ status: "invited", clerk_user_id: null })]);

    await expect(updateUser(SUPER, FULL)).rejects.toThrow(CHANGED);
    expect(clerk.users.updateUser).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });

  it("only the name changed: name steps run, the role is not written", async () => {
    sqlMock.mockResolvedValueOnce([storedRow()]).mockResolvedValueOnce([{ id: ROW_ID }]);

    await updateUser(ADMIN, FULL);

    expect(clerk.users.updateUser).toHaveBeenCalledTimes(1);
    expect(writes()).toHaveLength(1);
    expect(sqlText(writes()[0])).toMatch(/^update app_users set first_name/);
  });

  it("only the role changed: no Clerk call, a single role update", async () => {
    sqlMock.mockResolvedValueOnce([{ id: ROW_ID }]);

    await updateUser(ADMIN, { ...ROLE_ONLY, firstName: "Ana", lastName: "Perez", expectedFirstName: "Ana", expectedLastName: "Perez" });

    expect(clerk.users.updateUser).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(1);
    expect(sqlText(writes()[0])).toMatch(/^update app_users set role/);
  });

  it("both changed: Clerk, name update in Neon, then role update", async () => {
    sqlMock.mockResolvedValueOnce([storedRow()]).mockResolvedValueOnce([{ id: ROW_ID }]).mockResolvedValueOnce([{ id: ROW_ID }]);

    await updateUser(SUPER, { ...FULL, role: "admin" });

    expect(writes().map((call) => sqlText(call).split(" ").slice(0, 5).join(" "))).toEqual([
      "update app_users set first_name =",
      "update app_users set role =",
    ]);
    expect(clerk.users.updateUser.mock.invocationCallOrder[0]).toBeLessThan(sqlMock.mock.invocationCallOrder[1]);
  });

  it("nothing changed: no calls", async () => {
    await updateUser(SUPER, { ...FULL, firstName: "Ana", lastName: "Perez" });
    expect(sqlMock).not.toHaveBeenCalled();
    expect(clerk.users.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    ["the superadmin role", SUPER, { ...FULL, role: "superadmin" as "admin" }],
    ["the own row", SUPER, { ...FULL, id: ACTOR_ID }],
  ])("%s is rejected before touching anything", async (_, actor, input) => {
    await expect(updateUser(actor, input)).rejects.toThrow(FORBIDDEN);
    expect(sqlMock).not.toHaveBeenCalled();
    expect(clerk.users.updateUser).not.toHaveBeenCalled();
  });

  it("name failure (Clerk or pre-check): the role is not attempted", async () => {
    sqlMock.mockResolvedValueOnce([storedRow()]);
    clerk.users.updateUser.mockRejectedValueOnce(clerkError(422));
    await expect(updateUser(SUPER, { ...FULL, role: "admin" })).rejects.toThrow("No se pudo guardar: revisa el nombre y el apellido.");

    vi.clearAllMocks();
    sqlMock.mockResolvedValueOnce([storedRow({ first_name: "Otro" })]);
    await expect(updateUser(SUPER, { ...FULL, role: "admin" })).rejects.toThrow(CHANGED);
    expect(writes()).toHaveLength(0);
  });

  it("role fails after the name was written: ROLE_PARTIAL, one Clerk call, tagged log without personal data", async () => {
    sqlMock.mockResolvedValueOnce([storedRow()]).mockResolvedValueOnce([{ id: ROW_ID }]).mockResolvedValueOnce([]);

    await expect(updateUser(SUPER, { ...FULL, role: "admin" })).rejects.toThrow(ROLE_PARTIAL);

    expect(clerk.users.updateUser).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith("users.service: updateUser failed", {
      code: undefined,
      message: new UsersError(ROLE_FAILED).message,
      step: "neon-role-after-name",
    });
  });

  it("role fails with no name change: its own message, not ROLE_PARTIAL", async () => {
    sqlMock.mockResolvedValueOnce([]);
    await expect(updateUser(SUPER, ROLE_ONLY)).rejects.toThrow(ROLE_FAILED);
  });
});
