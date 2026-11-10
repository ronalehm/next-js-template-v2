import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sqlMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => sqlMock }));

import { recordClerkUserDeleted } from "./identitySignals.service";

const ID = "user_2abcDEF123";
const statement = (call: unknown[]) => (call[0] as string[]).join("?").replace(/\s+/g, " ").trim();

beforeEach(() => {
  sqlMock.mockReset();
  sqlMock.mockResolvedValue([{ id: "row-1" }]);
});

describe("recordClerkUserDeleted", () => {
  it("runs the single RN-05 statement with the exact id (AC-06, AC-09)", async () => {
    await expect(recordClerkUserDeleted(ID)).resolves.toBeUndefined();

    expect(sqlMock).toHaveBeenCalledTimes(1);
    const call = sqlMock.mock.calls[0];
    expect(statement(call)).toBe(
      "update app_users set clerk_deleted_user_id = ? where clerk_user_id = ? and clerk_deleted_user_id is distinct from ? returning id",
    );
    expect(call.slice(1)).toEqual([ID, ID, ID]);
  });

  it("only writes clerk_deleted_user_id: no insert, delete, other columns or updated_at (AC-09, AC-12)", async () => {
    await recordClerkUserDeleted(ID);

    const sql = statement(sqlMock.mock.calls[0]).toLowerCase();
    expect(sql).not.toMatch(/\binsert\b|\bdelete\b/);
    expect(sql.match(/\bupdate\b/g)).toHaveLength(1);
    expect(sql.match(/\bset\b(.*?)\bwhere\b/)?.[1].trim()).toBe("clerk_deleted_user_id = ?");
    for (const column of ["updated_at", "role", "status", "invitation_id"]) {
      expect(sql).not.toContain(column);
    }
  });

  it("is a no-op that resolves when no row matches or the signal is already set (AC-06, AC-07)", async () => {
    sqlMock.mockResolvedValue([]);

    await expect(recordClerkUserDeleted(ID)).resolves.toBeUndefined();
    await expect(recordClerkUserDeleted(ID)).resolves.toBeUndefined();
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it("throws only when Neon fails (AC-10)", async () => {
    sqlMock.mockRejectedValueOnce(new Error("neon down"));

    await expect(recordClerkUserDeleted(ID)).rejects.toThrow("neon down");
    await expect(recordClerkUserDeleted(ID)).resolves.toBeUndefined();
  });

  it("does not log anything", async () => {
    const spies = [vi.spyOn(console, "error"), vi.spyOn(console, "log"), vi.spyOn(console, "warn")];
    await recordClerkUserDeleted(ID);
    sqlMock.mockRejectedValueOnce(new Error("x"));
    await recordClerkUserDeleted(ID).catch(() => undefined);

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("imports no clerkClient, auth or users.service (AC-12)", () => {
    const source = readFileSync(join(__dirname, "identitySignals.service.ts"), "utf8");
    const imports = source.match(/^import .*$/gm) ?? [];

    expect(imports).toEqual(['import "server-only";', 'import { getDb } from "@/lib/db";']);
  });
});
