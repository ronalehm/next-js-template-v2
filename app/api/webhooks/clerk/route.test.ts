import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recordMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
// Real verification, only spied so AC-02 can assert it is not called.
vi.mock("@clerk/nextjs/webhooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clerk/nextjs/webhooks")>();
  return { ...actual, verifyWebhook: vi.fn(actual.verifyWebhook) };
});
vi.mock("@/modules/users/server", async () => {
  const { userDeletedSchema } = await import("@/modules/users/schemas/users.schema");
  return { recordClerkUserDeleted: recordMock, userDeletedSchema };
});

import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextRequest } from "next/server";
import * as route from "./route";

const newSecret = () => `whsec_${randomBytes(24).toString("base64")}`;
const SECRET = newSecret();
const ID = "user_2abcDEF123";
const EMAIL = "persona@example.com";

const sign = (secret: string, msgId: string, ts: number, body: string) =>
  `v1,${createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
    .update(`${msgId}.${ts}.${body}`)
    .digest("base64")}`;

const now = () => Math.floor(Date.now() / 1000);
const deleted = (id = ID) => JSON.stringify({ type: "user.deleted", data: { id, deleted: true, object: "user" } });

function req(
  body: string,
  o: { secret?: string; ts?: number; signature?: string; headers?: Record<string, string | null> } = {},
) {
  const ts = o.ts ?? now();
  const headers: Record<string, string> = {
    "svix-id": "msg_1",
    "svix-timestamp": String(ts),
    "svix-signature": o.signature ?? sign(o.secret ?? SECRET, "msg_1", ts, body),
  };
  for (const [k, v] of Object.entries(o.headers ?? {})) {
    if (v === null) delete headers[k];
    else headers[k] = v;
  }
  return new NextRequest("http://localhost/api/webhooks/clerk", { method: "POST", body, headers });
}

let errorSpy: ReturnType<typeof vi.spyOn>;
const logs = () => errorSpy.mock.calls.map((c: unknown[]) => c[0]);

beforeEach(() => {
  vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", SECRET);
  recordMock.mockReset();
  recordMock.mockResolvedValue(undefined);
  vi.mocked(verifyWebhook).mockClear();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/clerk", () => {
  it("valid user.deleted records the signal and answers ok (AC-01, AC-06)", async () => {
    const res = await route.POST(req(deleted()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(recordMock).toHaveBeenCalledExactlyOnceWith(ID);
    expect(logs()).toEqual([]);
  });

  it.each([undefined, "", "   "])("missing or blank secret %j: 500 without verifying (AC-02)", async (value) => {
    if (value === undefined) vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", undefined as unknown as string);
    else vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", value);
    const res = await route.POST(req(deleted()));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ status: "misconfigured" });
    expect(verifyWebhook).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
    expect(logs()).toEqual([{ code: "missing_secret", status: 500 }]);
  });

  describe("invalid signature (AC-03, AC-04)", () => {
    const bad = `v1,${Buffer.from("bad-signature-bytes-0123456789abcdef").toString("base64")}`;

    async function expectInvalid(request: NextRequest) {
      const res = await route.POST(request);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ status: "invalid" });
      expect(recordMock).not.toHaveBeenCalled();
      expect(logs()).toEqual([{ code: "invalid_signature", status: 400 }]);
    }

    it("wrong signature", () => expectInvalid(req(deleted(), { signature: bad })));
    it("signed with another secret", () => expectInvalid(req(deleted(), { secret: newSecret() })));
    it("altered body", () => {
      const ts = now();
      return expectInvalid(req(deleted("user_other"), { ts, signature: sign(SECRET, "msg_1", ts, deleted()) }));
    });
    it("multiple signatures, all bad", () => expectInvalid(req(deleted(), { signature: `${bad} ${bad}` })));
    it.each(["svix-id", "svix-timestamp", "svix-signature"])("missing %s header", (h) =>
      expectInvalid(req(deleted(), { headers: { [h]: null } })),
    );
    it.each([-400, 400])("timestamp off by %i s", (delta) => expectInvalid(req(deleted(), { ts: now() + delta })));

    it("multiple signatures with one good is accepted", async () => {
      const ts = now();
      const res = await route.POST(req(deleted(), { signature: `${bad} ${sign(SECRET, "msg_1", ts, deleted())}`, ts }));
      expect(res.status).toBe(200);
      expect(recordMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("event filtering (AC-05)", () => {
    it("other event type: ignored, no log, no write", async () => {
      const res = await route.POST(req(JSON.stringify({ type: "user.created", data: { id: ID } })));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "ignored" });
      expect(recordMock).not.toHaveBeenCalled();
      expect(logs()).toEqual([]);
    });

    it.each([
      ["bad id", { id: "not-a-user", deleted: true }],
      ["deleted not true", { id: ID, deleted: false }],
      ["no id", { deleted: true }],
    ])("user.deleted with %s: ignored with invalid_payload log", async (_n, data) => {
      const res = await route.POST(req(JSON.stringify({ type: "user.deleted", data })));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "ignored" });
      expect(recordMock).not.toHaveBeenCalled();
      expect(logs()).toEqual([{ code: "invalid_payload", status: 200 }]);
    });
  });

  it("duplicate delivery answers ok both times (AC-07)", async () => {
    expect((await route.POST(req(deleted()))).status).toBe(200);
    expect((await route.POST(req(deleted()))).status).toBe(200);
    expect(recordMock).toHaveBeenCalledTimes(2);
  });

  it("DB failure answers 500 retry; the retry succeeds (AC-10)", async () => {
    recordMock.mockRejectedValueOnce(new Error("neon down"));
    const first = await route.POST(req(deleted()));
    expect(first.status).toBe(500);
    expect(await first.json()).toEqual({ status: "retry" });
    expect(logs()).toEqual([{ code: "db_error", step: "record", status: 500 }]);

    const second = await route.POST(req(deleted()));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ status: "ok" });
  });

  it("no log or body leaks secret, ids, emails or exception messages (AC-11)", async () => {
    recordMock.mockRejectedValue(new Error(`boom ${ID} ${EMAIL} ${SECRET}`));
    const responses = [
      await route.POST(req(deleted())),
      await route.POST(req(deleted(), { secret: newSecret() })),
      await route.POST(req(deleted(), { headers: { "svix-id": null } })),
      await route.POST(req(JSON.stringify({ type: "user.deleted", data: { id: ID, deleted: false, email: EMAIL } }))),
    ];
    vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", "");
    responses.push(await route.POST(req(deleted())));

    const out = JSON.stringify([logs(), await Promise.all(responses.map((r) => r.text()))]);
    for (const secretValue of [ID, EMAIL, SECRET, "msg_1", "boom", "svix"]) expect(out).not.toContain(secretValue);
    for (const entry of logs()) {
      expect(Object.keys(entry as object).every((k) => ["code", "step", "status"].includes(k))).toBe(true);
    }
    expect(errorSpy).toHaveBeenCalledTimes(5);
  });

  it("route imports only the users server entry, Clerk webhooks and the Next request type (AC-12)", () => {
    const src = readFileSync(join(__dirname, "route.ts"), "utf8");
    const specifiers = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(specifiers.sort()).toEqual(["@clerk/nextjs/webhooks", "@/modules/users/server", "next/server"].sort());
    expect(src).not.toMatch(/clerkClient|lib\/auth|createInvitation/);
  });

  it("only POST is a handler; Next answers 405 for the rest (AC-13)", () => {
    const handlers = Object.keys(route).filter((k) => /^[A-Z]+$/.test(k));
    expect(handlers).toEqual(["POST"]);
  });
});
