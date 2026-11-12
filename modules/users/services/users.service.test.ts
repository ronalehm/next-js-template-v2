import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClerkAPIResponseError } from "@clerk/nextjs/errors";

const { sqlMock, clerk, clerkClientMock } = vi.hoisted(() => {
  const sqlMock = Object.assign(vi.fn(), { unsafe: (raw: string) => ({ raw }) });
  const clerk = {
    invitations: { createInvitation: vi.fn(), revokeInvitation: vi.fn() },
    users: { getUserList: vi.fn(), getUser: vi.fn(), updateUser: vi.fn(), deleteUser: vi.fn() },
    sessions: { getSessionList: vi.fn() },
  };
  const clerkClientMock = vi.fn(async () => clerk);
  return { sqlMock, clerk, clerkClientMock };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => sqlMock }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: clerkClientMock }));

import type { Actor } from "@/lib/auth";
import type { Role } from "@/lib/roles";
import type { SortKey, UsersQuery } from "../types/users.types";
import { assignableRoles } from "../utils/userPermissions";
import {
  CLERK_IDENTITY_BUDGET_MS,
  activateUser,
  changeUserRole,
  countActiveSessions,
  deleteUser,
  getClerkActivity,
  inviteUser,
  listUsers,
  recoverUserAccess,
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

const clerkError = (status: number, code?: string) =>
  new ClerkAPIResponseError("clerk", { data: code ? [{ code, message: "m", long_message: "m" }] : [], status });

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
    ["deleteUser", () => deleteUser(USER, { id: ROW_ID, email: "u@example.com" })],
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
    clerk_deleted: false,
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
      { total: 0, page: 1, id: null, email: null, first_name: null, last_name: null, role: null, status: null, clerk_user_id: null, clerk_deleted: null, created_at: null },
    ]);

    expect(await listUsers(SUPER, query({ page: 4 }))).toEqual({
      page: { rows: [], total: 0, page: 1, pageCount: 1 },
      clerkUserIds: {},
      identityRowIds: [],
      deletedSignalRowIds: [],
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
    expect(listing.identityRowIds).toEqual(["row-17"]);
    expect(listing.deletedSignalRowIds).toEqual([]);
    expect(JSON.stringify(listing.page)).not.toContain("user_17");
  });

  it.each([
    ["admin", ADMIN, ["row-1"]],
    ["superadmin", SUPER, ["row-1", "row-2"]],
  ] as [string, Actor, string[]][])(
    "identityRowIds for %s holds only linked rows whose role it manages",
    async (_, actor, expected) => {
      sqlMock.mockResolvedValueOnce([
        dbRow(1, "c1"),
        { ...dbRow(2, "c2"), role: "admin" },
        { ...dbRow(3, "c3"), role: "superadmin" },
        { ...dbRow(4, null), status: "invited" },
      ]);

      expect((await listUsers(actor, query())).identityRowIds).toEqual(expected);
    },
  );
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

    const activity = await getClerkActivity({ "row-a": "user_a", "row-b": "user_b" }, ["row-a", "row-b"]);

    expect(clerk.users.getUserList).toHaveBeenCalledTimes(1);
    expect(clerk.users.getUserList).toHaveBeenCalledWith({ userId: ["user_a", "user_b"], limit: 2 });
    expect(activity).toEqual({
      "row-a": { lastSignInAt: 1000, imageUrl: "https://img/a", identity: "verified" },
      "row-b": { lastSignInAt: null, imageUrl: null, identity: "verified" },
    });
    expect(clerk.users.getUser).not.toHaveBeenCalled();
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("marks linked rows unverified without throwing when Clerk fails", async () => {
    clerk.users.getUserList.mockRejectedValueOnce(new Error("down"));
    expect(await getClerkActivity({ "row-a": "user_a" }, ["row-a"])).toEqual({
      "row-a": { lastSignInAt: null, imageUrl: null, identity: "unverified" },
    });
  });
});

describe("getClerkActivity identity detection (SYNC-2)", () => {
  const UNVERIFIED = { lastSignInAt: null, imageUrl: null, identity: "unverified" };
  const VERIFIED_B = { lastSignInAt: 7, imageUrl: "https://img/b", identity: "verified" };
  const liveUser = (id: string) => ({ id, lastSignInAt: 7, hasImage: true, imageUrl: `https://img/${id.slice(-1)}` });
  const IDS = { "row-a": "user_a", "row-b": "user_b" };
  const ROWS = ["row-a", "row-b"];
  // `getUserList` that returns only user_a, so row-b is absent from the batch.
  const batchWithA = () => clerk.users.getUserList.mockResolvedValueOnce({ data: [liveUser("user_a")], totalCount: 1 });
  // Network failure as Clerk builds it: unexpected_error with no status (controlled cast, no any).
  const networkError = () =>
    new ClerkAPIResponseError("clerk", {
      data: [{ code: "unexpected_error", message: "m", long_message: "m" }],
      status: undefined as unknown as number,
    });
  const logged = () => (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls;

  // mockImplementation persists across clearAllMocks: reset so it cannot leak into other suites.
  beforeEach(() => {
    clerk.users.getUser.mockReset();
    clerk.users.getUserList.mockReset();
  });
  afterEach(() => {
    clerk.users.getUser.mockReset();
    clerk.users.getUserList.mockReset();
  });

  it("verifies an id absent from the batch when getUser answers 200", async () => {
    batchWithA();
    clerk.users.getUser.mockResolvedValueOnce(liveUser("user_b"));

    expect(await getClerkActivity(IDS, ROWS)).toEqual({
      "row-a": { lastSignInAt: 7, imageUrl: "https://img/a", identity: "verified" },
      "row-b": VERIFIED_B,
    });
    expect(clerk.users.getUser).toHaveBeenCalledWith("user_b");
  });

  it("concludes not_found only for 404 resource_not_found", async () => {
    batchWithA();
    clerk.users.getUser.mockRejectedValueOnce(clerkError(404, "resource_not_found"));

    const activity = await getClerkActivity(IDS, ROWS);
    expect(activity["row-b"]).toEqual({ lastSignInAt: null, imageUrl: null, identity: "not_found" });
    expect(logged()).toHaveLength(0);
  });

  it.each([
    ["404 without JSON body", () => clerkError(404)],
    ["404 with another code", () => clerkError(404, "route_not_found")],
    ["404 that is not a Clerk error", () => Object.assign(new Error("proxy"), { status: 404 })],
    ["401", () => clerkError(401, "authentication_invalid")],
    ["403", () => clerkError(403, "authorization_invalid")],
    ["429", () => clerkError(429, "too_many_requests")],
    ["500", () => clerkError(500, "internal_server_error")],
    ["API failure", () => clerkError(400, "form_param_missing")],
    ["network (unexpected_error, no status)", networkError],
    ["plain network error", () => new Error("fetch failed")],
  ])("getUser failing with %s leaves the row unverified, never not_found", async (_, makeError) => {
    batchWithA();
    clerk.users.getUser.mockRejectedValueOnce(makeError());

    expect((await getClerkActivity(IDS, ROWS))["row-b"]).toEqual(UNVERIFIED);
    expect(clerk.users.getUser).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["429", () => clerkError(429, "too_many_requests")],
    ["500", () => clerkError(500, "internal_server_error")],
    ["network", networkError],
  ])("a failed batch (%s) leaves every row unverified without getUser, writes or throwing", async (_, makeError) => {
    clerk.users.getUserList.mockRejectedValueOnce(makeError());

    expect(await getClerkActivity(IDS, ROWS)).toEqual({ "row-a": UNVERIFIED, "row-b": UNVERIFIED });
    expect(clerk.users.getUser).not.toHaveBeenCalled();
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("gives each row its own state in a mixed page and does one batch call plus k getUser, no retries", async () => {
    const ids = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`row-${i}`, `user_${i}`]));
    clerk.users.getUserList.mockResolvedValueOnce({ data: [liveUser("user_0"), liveUser("user_1")], totalCount: 2 });
    clerk.users.getUser.mockImplementation(async (id: string) => {
      if (id === "user_2") return liveUser(id);
      if (id === "user_3") throw clerkError(404, "resource_not_found");
      throw clerkError(500, "internal_server_error");
    });

    const activity = await getClerkActivity(ids, Object.keys(ids));

    expect(clerk.users.getUserList).toHaveBeenCalledTimes(1);
    expect(clerk.users.getUser).toHaveBeenCalledTimes(6);
    expect(activity["row-0"].identity).toBe("verified");
    expect(activity["row-2"].identity).toBe("verified");
    expect(activity["row-3"].identity).toBe("not_found");
    expect(activity["row-4"].identity).toBe("unverified");
    expect(Object.keys(activity)).toHaveLength(8);
  });

  it("without identityRowIds (default) every row is unverified and getUser is never called", async () => {
    batchWithA();

    expect(await getClerkActivity(IDS)).toEqual({ "row-a": UNVERIFIED, "row-b": UNVERIFIED });
    expect(clerk.users.getUser).not.toHaveBeenCalled();
  });

  it("rows the actor cannot manage: no getUser, unverified, null avatar and last sign-in even if the batch has them", async () => {
    // row-a present in the batch (not manageable), row-b absent (not manageable), row-c manageable and absent.
    clerk.users.getUserList.mockResolvedValueOnce({ data: [liveUser("user_a")], totalCount: 1 });
    clerk.users.getUser.mockRejectedValueOnce(clerkError(404, "resource_not_found"));

    const activity = await getClerkActivity({ ...IDS, "row-c": "user_c" }, ["row-c"]);

    expect(activity["row-a"]).toEqual(UNVERIFIED);
    expect(activity["row-b"]).toEqual(UNVERIFIED);
    expect(activity["row-c"].identity).toBe("not_found");
    expect(clerk.users.getUser).toHaveBeenCalledTimes(1);
    expect(clerk.users.getUser).toHaveBeenCalledWith("user_c");
  });

  it("never mutates Clerk or touches the database", async () => {
    batchWithA();
    clerk.users.getUser.mockRejectedValueOnce(clerkError(404, "resource_not_found"));

    await getClerkActivity(IDS, ROWS);

    expect(sqlMock).not.toHaveBeenCalled();
    expect(clerk.invitations.createInvitation).not.toHaveBeenCalled();
    expect(clerk.invitations.revokeInvitation).not.toHaveBeenCalled();
    expect(clerk.users.deleteUser).not.toHaveBeenCalled();
    expect(clerk.users.updateUser).not.toHaveBeenCalled();
  });

  it("logs only code, status and step, never ids, emails or Clerk messages", async () => {
    const leaky = (status: number) =>
      new ClerkAPIResponseError("clerk", {
        data: [{ code: "boom", message: "user_a ana@example.com", long_message: "user_a ana@example.com" }],
        status,
      });
    clerk.users.getUserList.mockRejectedValueOnce(leaky(500));
    await getClerkActivity(IDS, ROWS);
    batchWithA();
    clerk.users.getUser.mockRejectedValueOnce(leaky(429));
    await getClerkActivity(IDS, ROWS);

    expect(logged().map(([, detail]) => detail)).toEqual([
      { code: "boom", status: 500, step: "get-user-list" },
      { code: "boom", status: 429, step: "get-user" },
    ]);
    expect(JSON.stringify(logged())).not.toMatch(/user_a|example\.com/);
  });

  it("a non-Clerk error with an arbitrary code logs the fixed unexpected_error, never its code or message", async () => {
    const odd = Object.assign(new Error("user_a"), { code: "ana@example.com" });
    clerk.users.getUserList.mockRejectedValueOnce(odd);
    await getClerkActivity(IDS, ROWS);

    expect(logged().map(([, detail]) => detail)).toEqual([
      { code: "unexpected_error", status: undefined, step: "get-user-list" },
    ]);
    expect(JSON.stringify(logged())).not.toMatch(/user_a|example\.com/);
  });

  describe("time budget (RN-10)", () => {
    const never = () => new Promise<never>(() => {});

    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([
      ["getUserList", () => clerk.users.getUserList.mockImplementationOnce(never)],
      ["clerkClient()", () => clerkClientMock.mockImplementationOnce(never)],
    ])("a hanging %s resolves all rows unverified at 5000 ms, without getUser and with no timers left", async (_, hang) => {
      hang();
      const result = getClerkActivity(IDS, ROWS);

      await vi.advanceTimersByTimeAsync(CLERK_IDENTITY_BUDGET_MS);

      expect(await result).toEqual({ "row-a": UNVERIFIED, "row-b": UNVERIFIED });
      expect(clerk.users.getUser).not.toHaveBeenCalled();
      expect(logged()).toEqual([["users.service: get-user-list failed", { code: "timeout", step: "get-user-list" }]]);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("a hanging getUser leaves only that row unverified; confirmed rows keep their state", async () => {
      const ids = { "row-a": "user_a", "row-b": "user_b", "row-c": "user_c", "row-d": "user_d" };
      clerk.users.getUserList.mockResolvedValueOnce({ data: [liveUser("user_a")], totalCount: 1 });
      clerk.users.getUser.mockImplementation((id: string) =>
        id === "user_b" ? Promise.reject(clerkError(404, "resource_not_found")) : never(),
      );
      const result = getClerkActivity(ids, Object.keys(ids));

      await vi.advanceTimersByTimeAsync(CLERK_IDENTITY_BUDGET_MS);
      const activity = await result;

      expect(activity["row-a"].identity).toBe("verified");
      expect(activity["row-b"].identity).toBe("not_found");
      expect(activity["row-c"]).toEqual(UNVERIFIED);
      expect(activity["row-d"]).toEqual(UNVERIFIED);
      // One timeout log for the step, not one per hanging row.
      expect(logged()).toEqual([["users.service: get-user failed", { code: "timeout", step: "get-user" }]]);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("uses one deadline: a 3000 ms batch plus a hanging getUser resolves at 5000 ms total", async () => {
      clerk.users.getUserList.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({ data: [liveUser("user_a")], totalCount: 1 }), 3000)),
      );
      clerk.users.getUser.mockImplementationOnce(never);
      let done = false;
      const result = getClerkActivity(IDS, ROWS).then((value) => {
        done = true;
        return value;
      });

      await vi.advanceTimersByTimeAsync(4999);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      const activity = await result;
      expect(done).toBe(true);
      expect(activity["row-a"].identity).toBe("verified");
      expect(activity["row-b"]).toEqual(UNVERIFIED);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("discards late batch and getUser results (resolve or reject) with no extra calls", async () => {
      let lateBatch: (value: unknown) => void = () => {};
      let lateUser: (reason: unknown) => void = () => {};
      clerk.users.getUserList.mockImplementationOnce(() => new Promise((resolve) => (lateBatch = resolve)));
      const first = getClerkActivity(IDS, ROWS);
      await vi.advanceTimersByTimeAsync(CLERK_IDENTITY_BUDGET_MS);
      const firstResult = await first;

      batchWithA();
      clerk.users.getUser.mockImplementationOnce(() => new Promise((_, reject) => (lateUser = reject)));
      const second = getClerkActivity(IDS, ROWS);
      await vi.advanceTimersByTimeAsync(CLERK_IDENTITY_BUDGET_MS);
      const secondResult = await second;

      const snapshot = structuredClone([firstResult, secondResult]);
      lateBatch({ data: [liveUser("user_a")], totalCount: 1 });
      lateUser(clerkError(404, "resource_not_found"));
      await vi.advanceTimersByTimeAsync(10_000);

      expect([firstResult, secondResult]).toEqual(snapshot);
      expect(secondResult["row-b"]).toEqual(UNVERIFIED);
      expect(clerk.users.getUserList).toHaveBeenCalledTimes(2);
      expect(clerk.users.getUser).toHaveBeenCalledTimes(1);
      expect(sqlMock).not.toHaveBeenCalled();
    });

    it("leaves no timers on the failed-batch path either", async () => {
      clerk.users.getUserList.mockRejectedValueOnce(new Error("down"));
      await getClerkActivity(IDS, ROWS);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

describe("deletion signal (SYNC-3)", () => {
  const UNVERIFIED = { lastSignInAt: null, imageUrl: null, identity: "unverified" };
  const NOT_FOUND = { lastSignInAt: null, imageUrl: null, identity: "not_found" };
  const liveUser = (id: string) => ({ id, lastSignInAt: 7, hasImage: true, imageUrl: `https://img/${id.slice(-1)}` });
  const IDS = { "row-a": "user_a", "row-b": "user_b" };
  const ROWS = ["row-a", "row-b"];
  const logged = () => (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls;

  beforeEach(() => {
    clerk.users.getUser.mockReset();
    clerk.users.getUserList.mockReset();
  });
  afterEach(() => {
    clerk.users.getUser.mockReset();
    clerk.users.getUserList.mockReset();
  });

  describe("listUsers (RN-08, AC-17)", () => {
    const query: UsersQuery = { q: "", status: "all", role: "all", sort: "name", page: 1 };
    const dbRow = (n: number, role: string, clerkUserId: string | null, clerkDeleted: boolean) => ({
      total: 4,
      page: 1,
      id: `row-${n}`,
      email: `u${n}@example.com`,
      first_name: null,
      last_name: null,
      role,
      status: clerkUserId ? "active" : "invited",
      clerk_user_id: clerkUserId,
      clerk_deleted: clerkDeleted,
      created_at: new Date("2026-11-01T10:00:00Z"),
    });

    it("selects only the boolean expression; the dead id never leaves SQL", async () => {
      sqlMock.mockResolvedValueOnce([]);
      await listUsers(SUPER, query);

      const text = sqlText(sqlCalls()[0]);
      expect(text).toContain("(f.clerk_user_id is not null and f.clerk_deleted_user_id = f.clerk_user_id) as clerk_deleted");
      expect(text).not.toMatch(/f\.clerk_deleted_user_id,|, f\.clerk_deleted_user_id/);
    });

    it("superadmin: deletedSignalRowIds holds flagged rows of user and admin, never unflagged, superadmin or unlinked", async () => {
      sqlMock.mockResolvedValueOnce([
        dbRow(1, "user", "c1", true),
        dbRow(2, "admin", "c2", true),
        dbRow(3, "user", "c3", false),
        dbRow(4, "superadmin", "c4", true),
        dbRow(5, "user", null, true),
      ]);

      const listing = await listUsers(SUPER, query);
      expect(listing.deletedSignalRowIds).toEqual(["row-1", "row-2"]);
      expect(listing.deletedSignalRowIds.every((id) => listing.identityRowIds.includes(id))).toBe(true);
    });

    it("admin: admin and superadmin rows never enter deletedSignalRowIds", async () => {
      sqlMock.mockResolvedValueOnce([
        dbRow(1, "user", "c1", true),
        dbRow(2, "admin", "c2", true),
        dbRow(3, "superadmin", "c3", true),
      ]);

      const listing = await listUsers(ADMIN, query);
      expect(listing.deletedSignalRowIds).toEqual(["row-1"]);
      expect(JSON.stringify(listing.page)).not.toContain("clerk_deleted");
    });
  });

  describe("getClerkActivity merge (RN-11, AC-14)", () => {
    it("batch ok, getUser 404: not_found (already live) and the signal changes nothing", async () => {
      clerk.users.getUserList.mockResolvedValueOnce({ data: [liveUser("user_a")], totalCount: 1 });
      clerk.users.getUser.mockRejectedValueOnce(clerkError(404, "resource_not_found"));

      const activity = await getClerkActivity(IDS, ROWS, ["row-b"]);
      expect(activity["row-a"].identity).toBe("verified");
      expect(activity["row-b"]).toEqual(NOT_FOUND);
    });

    it("batch ok, ambiguous getUser failure (404 without code, 429): signal turns unverified into not_found", async () => {
      for (const error of [clerkError(404), clerkError(429, "too_many_requests")]) {
        clerk.users.getUserList.mockResolvedValueOnce({ data: [liveUser("user_a")], totalCount: 1 });
        clerk.users.getUser.mockRejectedValueOnce(error);

        const activity = await getClerkActivity(IDS, ROWS, ["row-b"]);
        expect(activity["row-a"].identity).toBe("verified");
        expect(activity["row-b"]).toEqual(NOT_FOUND);
      }
    });

    it("failed batch (429): signalled rows become not_found, the rest stay unverified, no getUser", async () => {
      clerk.users.getUserList.mockRejectedValueOnce(clerkError(429, "too_many_requests"));

      expect(await getClerkActivity(IDS, ROWS, ["row-a"])).toEqual({ "row-a": NOT_FOUND, "row-b": UNVERIFIED });
      expect(clerk.users.getUser).not.toHaveBeenCalled();
    });

    it("failed batch (plain error): signalled rows become not_found and nothing throws", async () => {
      clerk.users.getUserList.mockRejectedValueOnce(new Error("down"));

      expect(await getClerkActivity(IDS, ROWS, ROWS)).toEqual({ "row-a": NOT_FOUND, "row-b": NOT_FOUND });
    });

    it("batch timeout: signalled row becomes not_found at 5000 ms and no timers are left", async () => {
      vi.useFakeTimers();
      try {
        clerk.users.getUserList.mockImplementationOnce(() => new Promise<never>(() => {}));
        const result = getClerkActivity(IDS, ROWS, ["row-b"]);

        await vi.advanceTimersByTimeAsync(CLERK_IDENTITY_BUDGET_MS);

        expect(await result).toEqual({ "row-a": UNVERIFIED, "row-b": NOT_FOUND });
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("getUser timeout: signalled row becomes not_found, unsignalled stays unverified", async () => {
      vi.useFakeTimers();
      try {
        clerk.users.getUserList.mockResolvedValueOnce({ data: [], totalCount: 0 });
        clerk.users.getUser.mockImplementation(() => new Promise<never>(() => {}));
        const result = getClerkActivity(IDS, ROWS, ["row-b"]);

        await vi.advanceTimersByTimeAsync(CLERK_IDENTITY_BUDGET_MS);

        expect(await result).toEqual({ "row-a": UNVERIFIED, "row-b": NOT_FOUND });
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("AC-15: a live 200 (batch or getUser) wins over the signal", async () => {
      clerk.users.getUserList.mockResolvedValueOnce({ data: [liveUser("user_a")], totalCount: 1 });
      clerk.users.getUser.mockResolvedValueOnce(liveUser("user_b"));

      const activity = await getClerkActivity(IDS, ROWS, ROWS);
      expect(activity["row-a"]).toEqual({ lastSignInAt: 7, imageUrl: "https://img/a", identity: "verified" });
      expect(activity["row-b"]).toEqual({ lastSignInAt: 7, imageUrl: "https://img/b", identity: "verified" });
    });

    it("AC-17: ignores signals for rows outside identityRowIds and for rows with no Clerk link", async () => {
      clerk.users.getUserList.mockRejectedValueOnce(new Error("down"));

      const activity = await getClerkActivity(IDS, ["row-a"], ["row-a", "row-b", "row-ghost"]);
      expect(activity).toEqual({ "row-a": NOT_FOUND, "row-b": UNVERIFIED });
      expect(Object.keys(activity)).toEqual(["row-a", "row-b"]);
    });

    it("AC-17: a stale signal does not matter when the row is not flagged by listUsers (empty list)", async () => {
      clerk.users.getUserList.mockRejectedValueOnce(new Error("down"));
      expect(await getClerkActivity(IDS, ROWS, [])).toEqual({ "row-a": UNVERIFIED, "row-b": UNVERIFIED });
    });

    it("never logs ids or the signal", async () => {
      clerk.users.getUserList.mockRejectedValueOnce(clerkError(500, "internal_server_error"));
      await getClerkActivity(IDS, ROWS, ROWS);
      expect(JSON.stringify(logged())).not.toMatch(/user_a|user_b|row-/);
    });
  });

  describe("AC-16 default", () => {
    it("without third argument or with [] the result equals the SYNC-2 result", async () => {
      for (const args of [[ROWS], [ROWS, []]] as [string[], string[]?][]) {
        clerk.users.getUserList.mockResolvedValueOnce({ data: [liveUser("user_a")], totalCount: 1 });
        clerk.users.getUser.mockRejectedValueOnce(clerkError(500, "internal_server_error"));
        expect(await getClerkActivity(IDS, ...args)).toEqual({
          "row-a": { lastSignInAt: 7, imageUrl: "https://img/a", identity: "verified" },
          "row-b": UNVERIFIED,
        });
      }
    });
  });

  describe("AC-19 recoverUserAccess", () => {
    it("still calls getUser and fails with STILL_EXISTS when Clerk answers 200, regardless of any signal", async () => {
      sqlMock.mockResolvedValueOnce([
        { role: "user", status: "active", invitation_id: "inv_old", email: "p@example.com", linked: true, clerk_user_id: "user_dead" },
      ]);
      clerk.users.getUser.mockResolvedValueOnce(liveUser("user_dead"));

      await expect(recoverUserAccess(ADMIN, { id: ROW_ID }, REDIRECT)).rejects.toThrow(
        new UsersError("La cuenta todavía existe en el proveedor de acceso. No hay nada que recuperar."),
      );
      expect(clerk.users.getUser).toHaveBeenCalledWith("user_dead");
      expect(clerk.invitations.createInvitation).not.toHaveBeenCalled();
      expect(writes()).toHaveLength(0);
    });
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

describe("recoverUserAccess (SPEC sync-clerk-neon)", () => {
  const CLERK_ID = "user_dead";
  const EMAIL = "persona@example.com";
  const STILL_EXISTS = "La cuenta todavía existe en el proveedor de acceso. No hay nada que recuperar.";
  const IDENTITY = "Para recuperar a un administrador debes confirmar que verificaste su identidad.";
  const INVITATION_FAILED =
    "No se pudo crear la invitación. Si el correo ya tiene una cuenta o invitación pendiente en el proveedor de acceso, resuélvelo allí e inténtalo de nuevo.";
  const CHANGED = "El usuario cambió mientras tanto. Recarga la página.";
  const stored = (overrides: Record<string, unknown> = {}) => ({
    role: "user",
    status: "active",
    invitation_id: "inv_old",
    email: EMAIL,
    linked: true,
    clerk_user_id: CLERK_ID,
    ...overrides,
  });
  const run = (actor: Actor = ADMIN, input: { id?: string; identityVerified?: boolean } = {}) =>
    recoverUserAccess(actor, { id: ROW_ID, ...input }, REDIRECT);
  const notFound = () => clerkError(404, "resource_not_found");
  const untouched = () => {
    expect(clerk.invitations.createInvitation).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  };
  const loggedText = () => JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls);

  beforeEach(() => {
    clerk.users.getUser.mockRejectedValue(notFound());
  });

  it("AC-01/AC-22: admin recovers a user row; ignoreExisting false; one conditional update", async () => {
    sqlMock.mockResolvedValueOnce([stored()]).mockResolvedValueOnce([{ id: ROW_ID }]);

    await run();

    expect(clerk.users.getUser).toHaveBeenCalledWith(CLERK_ID);
    expect(clerk.invitations.createInvitation).toHaveBeenCalledWith({
      emailAddress: EMAIL,
      redirectUrl: REDIRECT,
      notify: true,
      ignoreExisting: false,
    });
    expect(writes()).toHaveLength(1);
    const update = sqlCalls()[1];
    expect(sqlText(update)).toBe(
      "update app_users set clerk_user_id = null, status = 'invited', invitation_id = $, updated_at = now() where id = $ and status = 'active' and clerk_user_id = $ and invitation_id is not distinct from $ and role = $ and email = $ and id <> $ and role <> 'superadmin' and role = any($) returning id",
    );
    expect(params(update)).toEqual(["inv_new", ROW_ID, CLERK_ID, "inv_old", "user", EMAIL, ACTOR_ID, ["user"]]);
    expect(clerk.invitations.revokeInvitation).not.toHaveBeenCalled();
  });

  it("AC-21: superadmin recovers an admin row with identityVerified true", async () => {
    sqlMock.mockResolvedValueOnce([stored({ role: "admin" })]).mockResolvedValueOnce([{ id: ROW_ID }]);

    await run(SUPER, { identityVerified: true });

    expect(params(sqlCalls()[1])).toContain("admin");
    expect(writes()).toHaveLength(1);
  });

  it("AC-22: superadmin recovers a user row without identityVerified", async () => {
    sqlMock.mockResolvedValueOnce([stored()]).mockResolvedValueOnce([{ id: ROW_ID }]);
    await run(SUPER);
    expect(writes()).toHaveLength(1);
  });

  it("AC-20: admin row without identityVerified is rejected before Clerk (also false/undefined)", async () => {
    for (const input of [{}, { identityVerified: false }]) {
      sqlMock.mockResolvedValueOnce([stored({ role: "admin" })]);
      await expect(run(SUPER, input)).rejects.toThrow(new UsersError(IDENTITY));
    }
    expect(clerk.users.getUser).not.toHaveBeenCalled();
    untouched();
  });

  it("AC-15: actor without users:manage never reaches the database or Clerk", async () => {
    await expect(run(USER)).rejects.toThrow(new UsersError(FORBIDDEN));
    expect(sqlMock).not.toHaveBeenCalled();
    expect(clerk.users.getUser).not.toHaveBeenCalled();
  });

  it.each([
    ["admin on an admin row (even verified)", ADMIN, stored({ role: "admin" }), { identityVerified: true }],
    ["admin on a superadmin row", ADMIN, stored({ role: "superadmin" }), {}],
    ["superadmin on a superadmin row", SUPER, stored({ role: "superadmin" }), { identityVerified: true }],
  ])("AC-02: %s is FORBIDDEN before Clerk", async (_, actor, row, input) => {
    sqlMock.mockResolvedValueOnce([row]);
    await expect(run(actor, input)).rejects.toThrow(new UsersError(FORBIDDEN));
    expect(clerk.users.getUser).not.toHaveBeenCalled();
    untouched();
  });

  it("AC-03: own row is FORBIDDEN", async () => {
    sqlMock.mockResolvedValueOnce([stored()]);
    await expect(recoverUserAccess(ADMIN, { id: ACTOR_ID }, REDIRECT)).rejects.toThrow(new UsersError(FORBIDDEN));
    expect(clerk.users.getUser).not.toHaveBeenCalled();
    untouched();
  });

  it.each([
    ["missing row", undefined],
    ["revoked", stored({ status: "revoked" })],
    ["invited", stored({ status: "invited", clerk_user_id: null, linked: false })],
    ["active without link", stored({ clerk_user_id: null, linked: false })],
  ])("AC-04/AC-11: %s throws CHANGED with zero Clerk calls and no write", async (_, row) => {
    sqlMock.mockResolvedValueOnce(row === undefined ? [] : [row]);
    await expect(run()).rejects.toThrow(new UsersError(CHANGED));
    expect(clerk.users.getUser).not.toHaveBeenCalled();
    untouched();
  });

  it("AC-05: getUser 200 means the account exists: message, no invitation, no update", async () => {
    clerk.users.getUser.mockReset().mockResolvedValue({ id: CLERK_ID });
    sqlMock.mockResolvedValueOnce([stored()]);
    await expect(run()).rejects.toThrow(new UsersError(STILL_EXISTS));
    untouched();
  });

  it.each([
    ["401", () => clerkError(401, "authentication_invalid")],
    ["403", () => clerkError(403, "forbidden")],
    ["429", () => clerkError(429, "too_many_requests")],
    ["500", () => clerkError(500)],
    ["network error", () => new Error("ECONNRESET")],
    ["404 with another code", () => clerkError(404, "not_found")],
    ["404 without code", () => clerkError(404)],
    ["404 not a Clerk error", () => Object.assign(new Error("nf"), { status: 404, errors: [{ code: "resource_not_found" }] })],
    ["unrecognized value", () => "boom"],
  ])("AC-06/17/18: getUser %s blocks: error rethrown, no invitation, no update", async (_, make) => {
    const failure = make();
    clerk.users.getUser.mockReset().mockRejectedValue(failure);
    sqlMock.mockResolvedValueOnce([stored()]);
    await expect(run()).rejects.toBe(failure);
    untouched();
  });

  it("AC-08/AC-19: createInvitation failure throws the fixed UsersError and leaves Neon untouched", async () => {
    clerk.invitations.createInvitation.mockRejectedValueOnce(clerkError(422, "form_identifier_exists"));
    sqlMock.mockResolvedValueOnce([stored()]);
    await expect(run()).rejects.toThrow(new UsersError(INVITATION_FAILED));
    expect(writes()).toHaveLength(0);
    expect(clerk.invitations.revokeInvitation).not.toHaveBeenCalled();
    for (const [arg] of clerk.invitations.createInvitation.mock.calls) {
      expect(arg).toMatchObject({ ignoreExisting: false });
    }
  });

  it.each([
    ["0 rows", () => sqlMock.mockResolvedValueOnce([stored()]).mockResolvedValueOnce([]), CHANGED],
    [
      "a throw",
      () => sqlMock.mockResolvedValueOnce([stored()]).mockRejectedValueOnce(new Error("neon down")),
      "neon down",
    ],
  ])("AC-09: update with %s revokes the new invitation and fails with its own error", async (_, setup, message) => {
    setup();
    await expect(run()).rejects.toThrow(message);
    expect(clerk.invitations.revokeInvitation).toHaveBeenCalledWith("inv_new");
    expect(writes()).toHaveLength(1);
  });

  it("AC-10b: compensating revoke 404 counts as done without logging a failure", async () => {
    sqlMock.mockResolvedValueOnce([stored()]).mockResolvedValueOnce([]);
    clerk.invitations.revokeInvitation.mockRejectedValueOnce(clerkError(404));
    await expect(run()).rejects.toThrow(CHANGED);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("AC-10c: compensating revoke with another error is logged, does not throw, original error prevails", async () => {
    sqlMock.mockResolvedValueOnce([stored()]).mockRejectedValueOnce(new Error("neon down"));
    clerk.invitations.revokeInvitation.mockRejectedValueOnce(clerkError(500));
    await expect(run()).rejects.toThrow("neon down");
    expect(console.error).toHaveBeenCalledWith("users.service: compensating revoke failed", expect.anything());
  });

  it("AC-11: running it twice recovers once; the repeat makes zero Clerk calls and no update", async () => {
    sqlMock.mockResolvedValueOnce([stored()]).mockResolvedValueOnce([{ id: ROW_ID }]);
    await run();
    clerk.users.getUser.mockClear();
    clerk.invitations.createInvitation.mockClear();
    sqlMock.mockResolvedValueOnce([stored({ status: "invited", clerk_user_id: null, linked: false, invitation_id: "inv_new" })]);

    await expect(run()).rejects.toThrow(new UsersError(CHANGED));
    expect(clerk.users.getUser).not.toHaveBeenCalled();
    expect(clerk.invitations.createInvitation).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(1);
  });

  it("AC-13: logs carry no email, name or Clerk id", async () => {
    sqlMock.mockResolvedValueOnce([stored()]);
    clerk.invitations.createInvitation.mockRejectedValueOnce(clerkError(422, "form_identifier_exists"));
    await expect(run()).rejects.toBeInstanceOf(UsersError);

    clerk.users.getUser.mockReset().mockRejectedValue(clerkError(500));
    sqlMock.mockResolvedValueOnce([stored()]);
    await expect(run()).rejects.toBeDefined();

    expect(console.error).toHaveBeenCalled();
    expect(loggedText()).not.toContain(EMAIL);
    expect(loggedText()).not.toContain(CLERK_ID);
  });

  it("AC-13: getUser error log keeps only code and status, never the Clerk message", async () => {
    const leaky = new ClerkAPIResponseError("clerk", {
      data: [{ code: "internal_error", message: `boom ${EMAIL}`, long_message: `boom ${EMAIL} ${CLERK_ID}` }],
      status: 500,
    });
    clerk.users.getUser.mockReset().mockRejectedValue(leaky);
    sqlMock.mockResolvedValueOnce([stored()]);

    await expect(run()).rejects.toBe(leaky);
    const [, payload] = (console.error as unknown as { mock: { calls: [string, Record<string, unknown>][] } }).mock.calls[0];
    expect(payload).toEqual({ code: "internal_error", step: "clerk-get-user", status: 500 });
    expect(loggedText()).not.toContain("boom");
    expect(loggedText()).not.toContain(EMAIL);
  });

  it("AC-19: invite and resend still call createInvitation with ignoreExisting true", async () => {
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: ROW_ID }]);
    await inviteUser(ADMIN, { email: "n@example.com", role: "user" }, REDIRECT);
    sqlMock
      .mockResolvedValueOnce([{ role: "user", status: "invited", invitation_id: "inv_old", email: EMAIL, linked: false }])
      .mockResolvedValueOnce([{ id: ROW_ID }]);
    await resendInvitation(ADMIN, { id: ROW_ID }, REDIRECT);

    const calls = clerk.invitations.createInvitation.mock.calls;
    expect(calls).toHaveLength(2);
    for (const [arg] of calls) expect(arg).toMatchObject({ ignoreExisting: true });
  });
});

describe("module source (CA-15, R48)", () => {
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? sourceFiles(path) : /\.test\.tsx?$/.test(name) ? [] : [path];
    });

  it("delete from, Clerk deleteUser and deleteInvitation live only inside deleteUser of users.service.ts (RN-10)", () => {
    const service = join(process.cwd(), "modules/users/services/users.service.ts");
    for (const file of sourceFiles(join(process.cwd(), "modules/users"))) {
      let text = readFileSync(file, "utf8");
      if (file === service) {
        const start = text.indexOf("export async function deleteUser(");
        const end = text.indexOf("\n}\n", start);
        expect(start).toBeGreaterThan(-1);
        expect(text.slice(start, end)).toMatch(/delete from/);
        text = text.slice(0, start) + text.slice(end);
      }
      expect(text, file).not.toMatch(/delete from|\.deleteUser\(|deleteInvitation/i);
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
      code: undefined,
      step: "neon-after-clerk",
    });
  });

  it.each([
    ["XX000", undefined],
    ["X1", undefined],
    ["23505", "23505"],
    ["form_param_invalid", "form_param_invalid"],
  ])("Neon error code %s is logged as %s", async (code, expected) => {
    sqlMock.mockResolvedValueOnce([storedRow()]).mockRejectedValueOnce(Object.assign(new Error("db down"), { code }));

    await expect(updateUserName(SUPER, NAME_INPUT)).rejects.toThrow(PARTIAL);

    expect(console.error).toHaveBeenCalledWith("users.service: updateUserName failed", {
      code: expected,
      step: "neon-after-clerk",
    });
  });

  it.each([["ana@example.com"], [""], ["a".repeat(65)], [42]])(
    "AC-04: invalid Neon code %j is logged as undefined",
    async (code) => {
      sqlMock.mockResolvedValueOnce([storedRow()]).mockRejectedValueOnce(Object.assign(new Error("db down"), { code }));

      await expect(updateUserName(SUPER, NAME_INPUT)).rejects.toThrow(PARTIAL);

      const [, payload] = vi.mocked(console.error).mock.calls[0];
      expect(payload).toEqual({ code: undefined, step: "neon-after-clerk" });
    },
  );

  it("AC-01: a Neon error with email, name and Clerk id in message, detail and code is not logged", async () => {
    const EMAIL = "persona@example.com";
    const CLERK_ID = "user_dead";
    const hostile = Object.assign(new Error(`dup ${EMAIL} Nombre Sintetico ${CLERK_ID}`), {
      code: EMAIL,
      detail: `Key (email)=(${EMAIL}) ${CLERK_ID}`,
    });
    sqlMock.mockResolvedValueOnce([storedRow()]).mockRejectedValueOnce(hostile);

    await expect(updateUserName(SUPER, NAME_INPUT)).rejects.toThrow(PARTIAL);

    const [, payload] = vi.mocked(console.error).mock.calls[0];
    expect(payload).not.toHaveProperty("message");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(
      new RegExp(`${EMAIL}|Nombre Sintetico|${CLERK_ID}`),
    );
  });

  it("0 rows after Clerk: partial message (not CHANGED), single Clerk call, tagged log", async () => {
    sqlMock.mockResolvedValueOnce([storedRow()]).mockResolvedValueOnce([]);

    const error = await updateUserName(SUPER, NAME_INPUT).catch((e) => e);

    expect(error).toBeInstanceOf(UsersError);
    expect(error.message).toBe(PARTIAL);
    expect(clerk.users.updateUser).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith("users.service: updateUserName failed", {
      code: undefined,
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
      step: "neon-role-after-name",
    });
  });

  it("role fails with no name change: its own message, not ROLE_PARTIAL", async () => {
    sqlMock.mockResolvedValueOnce([]);
    await expect(updateUser(SUPER, ROLE_ONLY)).rejects.toThrow(ROLE_FAILED);
  });
});

describe("deleteUser (USERS-DELETE)", () => {
  const EMAIL = "u@example.com";
  const PARTIAL_DELETE = "La cuenta se eliminó, pero el registro del panel no. Vuelve a intentarlo.";
  const CHANGED = "El usuario cambió mientras tanto. Recarga la página.";
  const stored = (overrides: Record<string, unknown> = {}) => ({
    role: "user",
    status: "active",
    invitation_id: null,
    email: EMAIL,
    linked: true,
    clerk_user_id: "user_target",
    ...overrides,
  });
  const invited = () => stored({ status: "invited", invitation_id: "inv_x", linked: false, clerk_user_id: null });
  const run = (actor: Actor = SUPER) => deleteUser(actor, { id: ROW_ID, email: EMAIL });
  const deletes = () => sqlCalls().filter((call) => /^delete\b/.test(sqlText(call)));

  it.each([
    ["active user", stored()],
    ["admin", stored({ role: "admin" })],
    ["revoked linked", stored({ status: "revoked" })],
  ])("%s: Clerk deleteUser first, then one conditional delete with every RN-05 clause", async (_, row) => {
    sqlMock.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ id: ROW_ID }]);

    await expect(run()).resolves.toBeUndefined();

    expect(clerk.users.deleteUser).toHaveBeenCalledWith("user_target");
    expect(clerk.invitations.revokeInvitation).not.toHaveBeenCalled();
    const del = sqlCalls()[1];
    expect(sqlText(del)).toBe(
      "delete from app_users where id = $ and email = $ and role = $ and status = $ and clerk_user_id is not distinct from $ and invitation_id is not distinct from $ and role <> 'superadmin' and id <> $ and clerk_user_id is distinct from $ returning id",
    );
    expect(params(del)).toEqual([ROW_ID, EMAIL, row.role, row.status, "user_target", null, ACTOR_ID, "user_actor"]);
    expect(clerk.users.deleteUser.mock.invocationCallOrder[0]).toBeLessThan(sqlMock.mock.invocationCallOrder[1]);
    expect(deletes()).toHaveLength(1);
  });

  it("invited row: revokes the invitation, never users.deleteUser, then deletes", async () => {
    sqlMock.mockResolvedValueOnce([invited()]).mockResolvedValueOnce([{ id: ROW_ID }]);
    await run();
    expect(clerk.invitations.revokeInvitation).toHaveBeenCalledWith("inv_x");
    expect(clerk.users.deleteUser).not.toHaveBeenCalled();
    expect(deletes()).toHaveLength(1);
  });

  it.each([
    ["revoked without Clerk id", stored({ status: "revoked", clerk_user_id: null, linked: false })],
    ["invited without invitation", stored({ status: "invited", clerk_user_id: null, linked: false })],
  ])("%s: only the row is deleted", async (_, row) => {
    sqlMock.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ id: ROW_ID }]);
    await run();
    expect(clerk.users.deleteUser).not.toHaveBeenCalled();
    expect(clerk.invitations.revokeInvitation).not.toHaveBeenCalled();
    expect(deletes()).toHaveLength(1);
  });

  it.each([
    ["admin actor", ADMIN, ROW_ID, stored()],
    ["self", SUPER, ACTOR_ID, stored()],
    ["superadmin target", SUPER, ROW_ID, stored({ role: "superadmin" })],
  ])("%s: FORBIDDEN before any Clerk call or delete", async (_, actor, id, row) => {
    sqlMock.mockResolvedValueOnce([row]);
    await expect(deleteUser(actor, { id, email: EMAIL })).rejects.toThrow(FORBIDDEN);
    expect(clerk.users.deleteUser).not.toHaveBeenCalled();
    expect(clerk.invitations.revokeInvitation).not.toHaveBeenCalled();
    expect(deletes()).toHaveLength(0);
  });

  it("missing row or email mismatch: CHANGED without Clerk", async () => {
    sqlMock.mockResolvedValueOnce([]);
    await expect(run()).rejects.toThrow(CHANGED);
    sqlMock.mockResolvedValueOnce([stored({ email: "other@example.com" })]);
    await expect(run()).rejects.toThrow(CHANGED);
    expect(clerk.users.deleteUser).not.toHaveBeenCalled();
    expect(deletes()).toHaveLength(0);
  });

  it("Clerk user 404 counts as done", async () => {
    sqlMock.mockResolvedValueOnce([stored()]).mockResolvedValueOnce([{ id: ROW_ID }]);
    clerk.users.deleteUser.mockRejectedValueOnce(clerkError(404));
    await expect(run()).resolves.toBeUndefined();
    expect(deletes()).toHaveLength(1);
  });

  it.each([
    ["500", clerkError(500)],
    ["403", clerkError(403)],
    ["400 with code", clerkError(400, "form_param_invalid")],
    ["network", new Error("network")],
  ])("Clerk user %s: stops before Neon, not a UsersError, log without personal data", async (_, error) => {
    sqlMock.mockResolvedValueOnce([stored()]);
    clerk.users.deleteUser.mockRejectedValueOnce(error);

    const thrown = await run().catch((e) => e);

    expect(thrown).toBe(error);
    expect(thrown).not.toBeInstanceOf(UsersError);
    expect(deletes()).toHaveLength(0);
    const logged = vi.mocked(console.error).mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(logged).sort()).toEqual(["code", "step"]);
    expect(logged.step).toBe("clerk-delete-user");
    expect(JSON.stringify(logged)).not.toContain(EMAIL);
  });

  it.each([
    ["clerk-delete-user", () => stored(), () => clerk.users.deleteUser],
    ["clerk-revoke-invitation", () => invited(), () => clerk.invitations.revokeInvitation],
  ])("AC-02: %s logs only code and step, even if Clerk or generic messages carry personal data", async (step, row, fn) => {
    const leak = `${EMAIL} Nombre Sintetico user_target`;
    const clerkErr = new ClerkAPIResponseError(`clerk ${leak}`, {
      data: [{ code: "form_param_invalid", message: leak, long_message: leak }],
      status: 400,
    });
    for (const error of [clerkErr, new Error(leak)]) {
      vi.clearAllMocks();
      sqlMock.mockResolvedValueOnce([row()]);
      fn().mockRejectedValueOnce(error);

      await expect(run()).rejects.toBe(error);

      const [, logged] = vi.mocked(console.error).mock.calls[0] as [string, Record<string, unknown>];
      expect(logged).toEqual({ code: error === clerkErr ? "form_param_invalid" : undefined, step });
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/example\.com|Nombre Sintetico|user_target/);
    }
  });

  it("clerkFailure falls back to a valid error.code on a non-Clerk error and validates it", async () => {
    for (const [code, expected] of [["23505", "23505"], ["XX000", undefined], [EMAIL, undefined]] as const) {
      vi.clearAllMocks();
      sqlMock.mockResolvedValueOnce([stored()]);
      clerk.users.deleteUser.mockRejectedValueOnce(Object.assign(new Error(`boom ${EMAIL}`), { code }));

      await expect(run()).rejects.toThrow();

      expect(vi.mocked(console.error).mock.calls[0][1]).toEqual({ code: expected, step: "clerk-delete-user" });
    }
  });

  it.each([
    ["404", clerkError(404)],
    ["400 invitation_already_revoked", clerkError(400, "invitation_already_revoked")],
  ])("invitation %s counts as done", async (_, error) => {
    sqlMock.mockResolvedValueOnce([invited()]).mockResolvedValueOnce([{ id: ROW_ID }]);
    clerk.invitations.revokeInvitation.mockRejectedValueOnce(error);
    await expect(run()).resolves.toBeUndefined();
    expect(deletes()).toHaveLength(1);
  });

  it.each([
    ["400 other code", clerkError(400, "other_code")],
    ["400 without code", clerkError(400)],
    ["already accepted (code unverified)", clerkError(403, "invitation_already_accepted")],
    ["500", clerkError(500)],
    ["unknown", new Error("boom")],
  ])("invitation %s: stops before Neon, not PARTIAL_DELETE", async (_, error) => {
    sqlMock.mockResolvedValueOnce([invited()]);
    clerk.invitations.revokeInvitation.mockRejectedValueOnce(error);

    const thrown = await run().catch((e) => e);

    expect(thrown).toBe(error);
    expect(deletes()).toHaveLength(0);
    expect(console.error).toHaveBeenCalledWith(
      "users.service: deleteUser failed",
      expect.objectContaining({ step: "clerk-revoke-invitation" }),
    );
  });

  it("tolerance is scoped to deleteUser: revokeUser still aborts on 400 invitation_already_revoked", async () => {
    const error = clerkError(400, "invitation_already_revoked");
    sqlMock.mockResolvedValueOnce([invited()]);
    clerk.invitations.revokeInvitation.mockRejectedValueOnce(error);
    await expect(revokeUser(SUPER, { id: ROW_ID })).rejects.toBe(error);
    expect(writes()).toHaveLength(0);
  });

  it.each([
    ["throws", (m: typeof sqlMock) => m.mockRejectedValueOnce(Object.assign(new Error("db down"), { code: "X1" }))],
    ["returns 0 rows", (m: typeof sqlMock) => m.mockResolvedValueOnce([])],
  ])("Clerk acted and Neon %s: PARTIAL_DELETE with tagged log, retry succeeds", async (_, neon) => {
    sqlMock.mockResolvedValueOnce([stored()]);
    neon(sqlMock);

    await expect(run()).rejects.toThrow(PARTIAL_DELETE);
    expect(console.error).toHaveBeenCalledWith(
      "users.service: deleteUser failed",
      expect.objectContaining({ step: "neon-after-clerk" }),
    );
    expect(vi.mocked(console.error).mock.calls[0][1]).not.toHaveProperty("message");

    sqlMock.mockResolvedValueOnce([stored()]).mockResolvedValueOnce([{ id: ROW_ID }]);
    clerk.users.deleteUser.mockRejectedValueOnce(clerkError(404));
    await expect(run()).resolves.toBeUndefined();
  });

  it("invited retry after PARTIAL_DELETE: 400 invitation_already_revoked then success", async () => {
    sqlMock.mockResolvedValueOnce([invited()]).mockResolvedValueOnce([]);
    await expect(run()).rejects.toThrow(PARTIAL_DELETE);

    sqlMock.mockResolvedValueOnce([invited()]).mockResolvedValueOnce([{ id: ROW_ID }]);
    clerk.invitations.revokeInvitation.mockRejectedValueOnce(clerkError(400, "invitation_already_revoked"));
    await expect(run()).resolves.toBeUndefined();
  });

  it("0 rows without a Clerk call: CHANGED", async () => {
    sqlMock
      .mockResolvedValueOnce([stored({ status: "revoked", clerk_user_id: null, linked: false })])
      .mockResolvedValueOnce([]);
    await expect(run()).rejects.toThrow(CHANGED);
  });
});
