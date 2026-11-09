import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Integrity tests (I-01..I-07). Skipped by default: they only run against a DISPOSABLE database.
// Never point DISPOSABLE_DATABASE_URL at DEV or PROD. The table user_profile_custom_fields (migration 0004)
// must already exist there; this file does not apply migrations (spec decision).

type Db = NeonQueryFunction<false, false>;

const holder = vi.hoisted(() => ({
  getDb: undefined as undefined | (() => unknown),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  getDb: () => {
    if (!holder.getDb) throw new Error("Disposable database not initialised");
    return holder.getDb();
  },
}));

import {
  addOwnCustomField,
  deleteOwnCustomField,
  getOwnCustomFields,
  moveOwnCustomField,
} from "./profile.service";

// --- Guard: runs at import time, before any connection. A failure fails the file (it is not skipped). ---

const disposableUrl = process.env.DISPOSABLE_DATABASE_URL;

function normalizedHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/-pooler(?=\.)/, "");
  } catch {
    throw new Error("DISPOSABLE_DATABASE_URL is not a valid connection URL");
  }
}

function assertDisposable(url: string): void {
  const disposableHost = normalizedHost(url);
  for (const name of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"] as const) {
    const other = process.env[name];
    if (!other) continue;
    const otherHost = normalizedHost(other);
    if (url === other || otherHost === disposableHost || otherHost.includes(disposableHost)) {
      throw new Error(`DISPOSABLE_DATABASE_URL points to the same database/host as ${name}; refusing to run`);
    }
  }
}

if (disposableUrl) assertDisposable(disposableUrl);

// --- Helpers ---------------------------------------------------------------

let sql: Db;
const createdUsers: string[] = [];
// When true, the service's batch gets its last statement (final list) replaced by a failing one (I-07).
let forceListFailure = false;

async function makeUser(): Promise<string> {
  const email = `integrity-${crypto.randomUUID()}@example.test`;
  const [row] = await sql`insert into app_users (email) values (${email}) returning id`;
  const id = String(row.id);
  createdUsers.push(id);
  return id;
}

async function rawInsert(userId: string, label: string, value: string, position: number) {
  return sql`insert into user_profile_custom_fields (user_id, label, value, position) values (${userId}, ${label}, ${value}, ${position})`;
}

async function rows(userId: string) {
  const result = await sql`select id, label, position::int as position from user_profile_custom_fields where user_id = ${userId} order by position`;
  return result as { id: string; label: string; position: number }[];
}

async function count(userId: string): Promise<number> {
  const [row] = await sql`select count(*)::int as n from user_profile_custom_fields where user_id = ${userId}`;
  return Number(row.n);
}

async function expectPgError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

async function expectDense(userId: string, n: number) {
  const positions = (await rows(userId)).map((row) => row.position);
  expect(positions).toEqual(Array.from({ length: n }, (_, i) => i + 1));
}

async function seed(userId: string, n: number): Promise<string[]> {
  for (let i = 1; i <= n; i++) {
    const result = await addOwnCustomField(userId, { label: `Campo ${i}`, value: `valor ${i}` });
    expect(result.ok).toBe(true);
  }
  return (await rows(userId)).map((row) => row.id);
}

const labelsOf = async (userId: string) => (await rows(userId)).map((row) => row.label);

// --- Tests -----------------------------------------------------------------

describe.skipIf(!disposableUrl)("profile.service integrity (disposable database)", () => {
  beforeAll(() => {
    const real = neon(disposableUrl as string);
    sql = real;
    // Service-facing db: same client, but the final list can be forced to fail (I-07).
    const serviceDb = Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => real(strings, ...values), {
      transaction: (queries: ReturnType<Db>[]) => {
        const batch = forceListFailure
          ? [...queries.slice(0, -1), real`select 1 / (${0}::int)`]
          : queries;
        return real.transaction(batch);
      },
    });
    holder.getDb = () => serviceDb;
  });

  afterAll(async () => {
    if (!sql) return;
    // Cascade removes the users' custom fields.
    for (const id of createdUsers) {
      await sql`delete from app_users where id = ${id}`;
    }
  });

  it("I-01: deleting a user cascades to their fields; unknown user_id fails the FK", async () => {
    const userId = await makeUser();
    await rawInsert(userId, "Uno", "1", 1);
    await rawInsert(userId, "Dos", "2", 2);
    expect(await count(userId)).toBe(2);

    await sql`delete from app_users where id = ${userId}`;
    expect(await count(userId)).toBe(0);

    await expectPgError(rawInsert(crypto.randomUUID(), "Huerfano", "x", 1), "23503");
  });

  it("I-02: direct SQL cannot bypass the cap or duplicate positions", async () => {
    const userId = await makeUser();
    await expectPgError(rawInsert(userId, "Cero", "x", 0), "23514");
    await expectPgError(rawInsert(userId, "Once", "x", 11), "23514");

    await rawInsert(userId, "A", "x", 1);
    await expectPgError(rawInsert(userId, "B", "x", 1), "23505");

    for (let p = 2; p <= 10; p++) await rawInsert(userId, `F${p}`, "x", p);
    expect(await count(userId)).toBe(10);
    await expectPgError(rawInsert(userId, "Repetida", "x", 5), "23505");
    await expectPgError(rawInsert(userId, "Once b", "x", 11), "23514");
    expect(await count(userId)).toBe(10);
  });

  it("I-03: label uniqueness (case-insensitive, per user) and label/value checks", async () => {
    const userId = await makeUser();
    const other = await makeUser();
    await rawInsert(userId, "Ubicación", "x", 1);
    await expectPgError(rawInsert(userId, "ubicación", "x", 2), "23505");
    await rawInsert(other, "Ubicación", "x", 1);

    await expectPgError(rawInsert(userId, " borde", "x", 2), "23514");
    await expectPgError(rawInsert(userId, "borde ", "x", 2), "23514");
    await expectPgError(rawInsert(userId, "dos  espacios", "x", 2), "23514");
    await expectPgError(rawInsert(userId, "con\u0001control", "x", 2), "23514");
    await expectPgError(rawInsert(userId, "x".repeat(41), "x", 2), "23514");
    await expectPgError(rawInsert(userId, "valor nl", "a\nb", 2), "23514");
    expect(await count(userId)).toBe(1);
  });

  it("I-04: swap (both directions, ends) and compaction run in one statement without breaking unique", async () => {
    const userId = await makeUser();
    const ids = await seed(userId, 4);
    expect(await labelsOf(userId)).toEqual(["Campo 1", "Campo 2", "Campo 3", "Campo 4"]);

    expect((await moveOwnCustomField(userId, ids[1], "down")).ok).toBe(true);
    expect(await labelsOf(userId)).toEqual(["Campo 1", "Campo 3", "Campo 2", "Campo 4"]);
    expect((await moveOwnCustomField(userId, ids[1], "up")).ok).toBe(true);
    expect(await labelsOf(userId)).toEqual(["Campo 1", "Campo 2", "Campo 3", "Campo 4"]);

    // Ends: no change, no error.
    expect((await moveOwnCustomField(userId, ids[0], "up")).ok).toBe(true);
    expect((await moveOwnCustomField(userId, ids[3], "down")).ok).toBe(true);
    expect(await labelsOf(userId)).toEqual(["Campo 1", "Campo 2", "Campo 3", "Campo 4"]);

    // Compaction after deleting a middle and then the first field.
    expect((await deleteOwnCustomField(userId, ids[1])).ok).toBe(true);
    expect(await labelsOf(userId)).toEqual(["Campo 1", "Campo 3", "Campo 4"]);
    await expectDense(userId, 3);
    expect((await deleteOwnCustomField(userId, ids[0])).ok).toBe(true);
    expect(await labelsOf(userId)).toEqual(["Campo 3", "Campo 4"]);
    await expectDense(userId, 2);
  });

  it("I-05: 12 parallel adds by one user -> exactly 10 rows, positions 1..10, exactly 2 limit results", async () => {
    const userId = await makeUser();
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => addOwnCustomField(userId, { label: `Paralelo ${i}`, value: "x" })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(10);
    expect(results.filter((r) => !r.ok && r.reason === "limit")).toHaveLength(2);
    expect(await count(userId)).toBe(10);
    await expectDense(userId, 10);
  });

  it("I-06: concurrent swaps and concurrent deletes keep positions 1..N", async () => {
    const userId = await makeUser();
    const ids = await seed(userId, 10);

    const moves = await Promise.all(
      ids.flatMap((id, i) => [moveOwnCustomField(userId, id, i % 2 === 0 ? "down" : "up")]),
    );
    expect(moves.every((r) => r.ok)).toBe(true);
    expect(await count(userId)).toBe(10);
    await expectDense(userId, 10);

    const toDelete = ids.filter((_, i) => i % 2 === 1);
    const deletes = await Promise.all(toDelete.map((id) => deleteOwnCustomField(userId, id)));
    expect(deletes.every((r) => r.ok)).toBe(true);
    expect(await count(userId)).toBe(5);
    await expectDense(userId, 5);
  });

  it("I-07: a failing statement rolls back the whole batch (S1, S2)", async () => {
    const userId = await makeUser();
    await expect(
      sql.transaction([
        sql`insert into user_profile_custom_fields (user_id, label, value, position) values (${userId}, 'Valida', 'x', 1)`,
        sql`select 1 / (${0}::int)`,
      ]),
    ).rejects.toBeDefined();
    expect(await count(userId)).toBe(0);

    // Through the real service: the final list is forced to fail after a valid insert.
    forceListFailure = true;
    try {
      await expect(addOwnCustomField(userId, { label: "Revertida", value: "x" })).rejects.toBeDefined();
    } finally {
      forceListFailure = false;
    }
    expect(await count(userId)).toBe(0);
    expect(await getOwnCustomFields(userId)).toEqual([]);
  });
});
