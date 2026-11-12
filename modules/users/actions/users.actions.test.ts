import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  revalidatePath: vi.fn(),
  origin: vi.fn(),
  invite: vi.fn(),
  update: vi.fn(),
  revoke: vi.fn(),
  del: vi.fn(),
  activate: vi.fn(),
  resend: vi.fn(),
  sessions: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getActor: mocks.getActor }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: mocks.origin }) }));
// Real UsersError (instanceof must hold), mocked service functions; real `can` and schemas.
vi.mock("../services/users.service", async (importOriginal) => ({
  UsersError: (await importOriginal<typeof import("../services/users.service")>()).UsersError,
  safeLogCode: (await importOriginal<typeof import("../services/users.service")>()).safeLogCode,
  inviteUser: mocks.invite,
  updateUser: mocks.update,
  revokeUser: mocks.revoke,
  deleteUser: mocks.del,
  activateUser: mocks.activate,
  resendInvitation: mocks.resend,
  countActiveSessions: mocks.sessions,
}));

import { UsersError } from "../services/users.service";
import {
  activateUserAction,
  deleteUserAction,
  getUserSessionsAction,
  inviteUserAction,
  resendInvitationAction,
  revokeUserAction,
  updateUserAction,
} from "./users.actions";

const GENERIC = "No se pudo completar la acción. Inténtalo de nuevo.";
const ACTOR = { id: "actor-1", role: "admin" };
const ID = "11111111-1111-4111-8111-111111111111";
const ORIGIN = "https://app.test";
const SIGN_UP = `${ORIGIN}/sign-up`;
const SESSIONS = 3;

type Case = {
  name: string;
  action: (input: unknown) => Promise<unknown>;
  service: ReturnType<typeof vi.fn>;
  input: Record<string, unknown>;
  // Extra args the service receives after the parsed data.
  extraArgs?: unknown[];
  needsOrigin?: boolean;
  mutates: boolean;
  // Valid shape with a role outside PANEL_ROLES, when the action takes a role.
  superadmin?: Record<string, unknown>;
};

const FULL = { id: ID, firstName: "Ana", lastName: "Pérez", expectedFirstName: "Ana", expectedLastName: "Pérez" };

const CASES: Case[] = [
  {
    name: "invite",
    action: inviteUserAction,
    service: mocks.invite,
    input: { email: "ana@example.com", role: "user" },
    extraArgs: [SIGN_UP],
    needsOrigin: true,
    mutates: true,
    superadmin: { email: "ana@example.com", role: "superadmin" },
  },
  {
    name: "update (full mode)",
    action: updateUserAction,
    service: mocks.update,
    input: { ...FULL, role: "admin", expectedRole: "user" },
    mutates: true,
    superadmin: { ...FULL, role: "superadmin", expectedRole: "user" },
  },
  {
    name: "update (role-only mode)",
    action: updateUserAction,
    service: mocks.update,
    input: { id: ID, role: "admin", expectedRole: "user" },
    mutates: true,
    superadmin: { id: ID, role: "superadmin", expectedRole: "user" },
  },
  { name: "revoke", action: revokeUserAction, service: mocks.revoke, input: { id: ID }, mutates: true },
  {
    name: "delete",
    action: deleteUserAction,
    service: mocks.del,
    input: { id: ID, email: "ana@example.com" },
    mutates: true,
  },
  { name: "activate", action: activateUserAction, service: mocks.activate, input: { id: ID }, mutates: true },
  {
    name: "resend",
    action: resendInvitationAction,
    service: mocks.resend,
    input: { id: ID },
    extraArgs: [SIGN_UP],
    needsOrigin: true,
    mutates: true,
  },
  { name: "sessions", action: getUserSessionsAction, service: mocks.sessions, input: { id: ID }, mutates: false },
];

const services = [mocks.invite, mocks.update, mocks.revoke, mocks.del, mocks.activate, mocks.resend, mocks.sessions];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActor.mockResolvedValue(ACTOR);
  mocks.origin.mockReturnValue(ORIGIN);
  for (const service of services) service.mockResolvedValue(undefined);
  mocks.sessions.mockResolvedValue(SESSIONS);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const expectRejected = (result: unknown) => expect(result).toEqual({ ok: false, error: GENERIC });
const expectNoServiceCalls = () => {
  for (const service of services) expect(service).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
};

describe.each(CASES)("$name action", (c) => {
  it("AC-06: returns the generic error and calls no service without an active session", async () => {
    mocks.getActor.mockResolvedValue(null);
    expectRejected(await c.action(c.input));
    expectNoServiceCalls();
  });

  it("AC-07: returns the generic error and calls no service for a user role (users:manage denied)", async () => {
    mocks.getActor.mockResolvedValue({ id: "actor-2", role: "user" });
    expectRejected(await c.action(c.input));
    expectNoServiceCalls();
  });

  it.each([
    ["extra key", { extra: 1 }],
    ["userId key", { userId: "someone-else" }],
  ])("AC-08: rejects %s", async (_label, extra) => {
    expectRejected(await c.action({ ...c.input, ...extra }));
    expectNoServiceCalls();
  });

  it("AC-08: rejects missing fields", async () => {
    expectRejected(await c.action({}));
    const [firstKey] = Object.keys(c.input);
    const rest = Object.fromEntries(Object.entries(c.input).filter(([key]) => key !== firstKey));
    expectRejected(await c.action(rest));
    expectNoServiceCalls();
  });

  it.each([null, "string", undefined, 42, []])("AC-08: rejects non-object input %j", async (input) => {
    expectRejected(await c.action(input));
    expectNoServiceCalls();
  });

  if ("id" in c.input) {
    it.each(["nope", "user_2abcDEF", "", 123])("AC-08: rejects non-uuid id %j", async (id) => {
      expectRejected(await c.action({ ...c.input, id }));
      expectNoServiceCalls();
    });
  }

  if (c.superadmin) {
    it("AC-08: rejects a role outside PANEL_ROLES (superadmin)", async () => {
      expectRejected(await c.action(c.superadmin));
      expectNoServiceCalls();
    });
  }

  if (c.needsOrigin) {
    it.each([null, "", "not a url", "ftp://app.test", "javascript:alert(1)"])(
      "rejects %j as Origin header: generic error, service not called",
      async (origin) => {
        mocks.origin.mockReturnValue(origin);
        expectRejected(await c.action(c.input));
        expectNoServiceCalls();
      },
    );
  }

  it("AC-09: passes the session actor and parsed data to the service", async () => {
    const result = await c.action(c.input);

    expect(result).toEqual(c.mutates ? { ok: true } : { ok: true, activeSessions: SESSIONS });
    expect(c.service).toHaveBeenCalledTimes(1);
    expect(c.service).toHaveBeenCalledWith(ACTOR, c.input, ...(c.extraArgs ?? []));
  });

  it(`AC-09: ${c.mutates ? "revalidates /dashboard/users" : "does not revalidate (read only)"}`, async () => {
    await c.action(c.input);

    if (c.mutates) {
      expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/users");
    } else {
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    }
  });

  it("AC-09: a non-UsersError is not leaked; the log carries only a validated code (uppercase XX000 becomes undefined)", async () => {
    c.service.mockRejectedValue(
      Object.assign(new Error("db down for ana@example.com"), { code: "XX000", stack: "STACKTRACE", detail: "row ana" }),
    );

    expectRejected(await c.action(c.input));
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(1);
    const [, payload] = vi.mocked(console.error).mock.calls[0];
    expect(payload).toEqual({ code: undefined });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("ana");
  });

  it("AC-09: a numeric SQLSTATE code is kept; message, detail and stack are not logged", async () => {
    c.service.mockRejectedValue(
      Object.assign(new Error("dup ana@example.com"), { code: "23505", stack: "STACKTRACE ana", detail: "Key (email)=(ana@example.com)" }),
    );

    expectRejected(await c.action(c.input));
    const [, payload] = vi.mocked(console.error).mock.calls[0];
    expect(payload).toEqual({ code: "23505" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("ana");
  });

  it.each([["ana@example.com"], ["X1"], [""], ["a".repeat(65)], [42]])(
    "AC-04: invalid code %j is logged as undefined",
    async (code) => {
      c.service.mockRejectedValue(Object.assign(new Error("boom"), { code }));

      expectRejected(await c.action(c.input));
      const [, payload] = vi.mocked(console.error).mock.calls[0];
      expect(payload).toEqual({ code: undefined });
    },
  );

  it("AC-09: a UsersError message does reach the caller", async () => {
    c.service.mockRejectedValue(new UsersError("No tienes permiso para esta acción."));

    expect(await c.action(c.input)).toEqual({ ok: false, error: "No tienes permiso para esta acción." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("AC-10: a valid foreign uuid goes as-is to the service with the session actor (ownership is the service's job)", async () => {
    // Membership/scope of the target row is enforced in users.service (covered by users.service.test.ts);
    // the action only validates shape, session and users:manage.
    const foreign = "99999999-9999-4999-8999-999999999999";
    const input = "id" in c.input ? { ...c.input, id: foreign } : c.input;

    await c.action(input);

    expect(c.service).toHaveBeenCalledWith(ACTOR, input, ...(c.extraArgs ?? []));
  });
});

describe("generic failures", () => {
  it("handles a thrown getActor as generic error without calling services", async () => {
    mocks.getActor.mockRejectedValue(new Error("clerk down"));
    expectRejected(await revokeUserAction({ id: ID }));
    expectNoServiceCalls();
  });
});
