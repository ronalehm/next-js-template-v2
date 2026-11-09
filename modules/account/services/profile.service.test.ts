import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock } = vi.hoisted(() => ({ sqlMock: Object.assign(vi.fn(), { transaction: vi.fn() }) }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => sqlMock }));

import type { ProfileFieldValue } from "../types/profile.types";
import {
  addOwnCustomField,
  deleteOwnCustomField,
  getOwnCustomFields,
  getOwnProfile,
  moveOwnCustomField,
  setOwnProfileField,
  updateOwnCustomField,
} from "./profile.service";

const USER_ID = "row-1";

const TEXT_COLUMNS = {
  jobTitle: "job_title",
  company: "company",
  birthday: "birthday",
  website: "website",
  note: "note",
} as const;

const TEXT_FIELDS = Object.keys(TEXT_COLUMNS) as (keyof typeof TEXT_COLUMNS)[];

const dbRow = {
  phone: "+51987654321",
  phone_type: "personal",
  job_title: "Cargo",
  company: null,
  birthday: "1990-03-12",
  website: null,
  note: null,
};

const profile = {
  phone: "+51987654321",
  phoneType: "personal",
  jobTitle: "Cargo",
  company: null,
  birthday: "1990-03-12",
  website: null,
  note: null,
};

const PHONE: ProfileFieldValue = { field: "phone", value: { phone: "+51987654321", type: "personal" } };

// Tagged-template call -> normalized SQL text.
const sqlText = (call: unknown[]) => (call[0] as string[]).join("$").replace(/\s+/g, " ");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOwnProfile", () => {
  it("returns every field as null when the user has no row", async () => {
    sqlMock.mockResolvedValueOnce([]);

    expect(await getOwnProfile(USER_ID)).toEqual({
      phone: null,
      phoneType: null,
      jobTitle: null,
      company: null,
      birthday: null,
      website: null,
      note: null,
    });
  });

  it("reads only the given user's row, phone_type included, with the id as a parameter", async () => {
    sqlMock.mockResolvedValueOnce([dbRow]);

    expect(await getOwnProfile(USER_ID)).toEqual(profile);
    expect(sqlMock).toHaveBeenCalledTimes(1);
    const text = sqlText(sqlMock.mock.calls[0]);
    expect(text).toMatch(/select phone, phone_type,/);
    expect(text).toMatch(/from user_profiles where user_id = \$\s*$/);
    expect(sqlMock.mock.calls[0].slice(1)).toEqual([USER_ID]);
  });
});

describe("setOwnProfileField", () => {
  it("writes phone and phone_type in a single upsert and nothing else", async () => {
    sqlMock.mockResolvedValueOnce([dbRow]);

    expect(await setOwnProfileField(USER_ID, PHONE)).toEqual(profile);

    expect(sqlMock).toHaveBeenCalledTimes(1);
    const call = sqlMock.mock.calls[0];
    const text = sqlText(call);
    const [write] = text.split(" returning ");

    expect(text).not.toMatch(/\bselect\b/);
    expect(write.trim()).toBe(
      "insert into user_profiles (user_id, phone, phone_type) values ($, $, $) on conflict (user_id) do update set phone = excluded.phone, phone_type = excluded.phone_type, updated_at = now()",
    );
    expect(call.slice(1)).toEqual([USER_ID, "+51987654321", "personal"]);
  });

  it("clears phone and phone_type together with value null", async () => {
    sqlMock.mockResolvedValueOnce([{ ...dbRow, phone: null, phone_type: null }]);

    const result = await setOwnProfileField(USER_ID, { field: "phone", value: null });

    expect(sqlMock.mock.calls[0].slice(1)).toEqual([USER_ID, null, null]);
    expect(result.phone).toBeNull();
    expect(result.phoneType).toBeNull();
  });

  it.each(TEXT_FIELDS)("runs a single upsert for %s that only writes its own column", async (field) => {
    sqlMock.mockResolvedValueOnce([dbRow]);

    const result = await setOwnProfileField(USER_ID, { field, value: "valor" });

    expect(sqlMock).toHaveBeenCalledTimes(1);
    const call = sqlMock.mock.calls[0];
    const text = sqlText(call);
    const column = TEXT_COLUMNS[field];
    const [write] = text.split(" returning ");

    expect(text).not.toMatch(/\bselect\b/);
    expect(write.trim()).toBe(
      `insert into user_profiles (user_id, ${column}) values ($, $) on conflict (user_id) do update set ${column} = excluded.${column}, updated_at = now()`,
    );
    expect(call.slice(1)).toEqual([USER_ID, "valor"]);
    expect(result).toEqual(profile);
  });

  it("passes null to clear a text column", async () => {
    sqlMock.mockResolvedValueOnce([{ ...dbRow, note: null }]);

    const result = await setOwnProfileField(USER_ID, { field: "note", value: null });

    expect(sqlMock.mock.calls[0].slice(1)).toEqual([USER_ID, null]);
    expect(result.note).toBeNull();
  });

  it("uses a different statement for each field, every one returning phone_type", async () => {
    sqlMock.mockResolvedValue([dbRow]);
    await setOwnProfileField(USER_ID, PHONE);
    for (const field of TEXT_FIELDS) {
      await setOwnProfileField(USER_ID, { field, value: "x" });
    }

    const statements = new Set(sqlMock.mock.calls.map((call) => call[0]));
    expect(statements.size).toBe(TEXT_FIELDS.length + 1);
    for (const call of sqlMock.mock.calls) {
      expect(sqlText(call).split(" returning ")[1]).toMatch(/\bphone_type\b/);
    }
  });

  it.each(["role", "__proto__", "toString", "user_id", "phoneType"])(
    "throws for a key outside the map (%s) without calling the database",
    async (field) => {
      await expect(
        setOwnProfileField(USER_ID, { field, value: "x" } as unknown as ProfileFieldValue),
      ).rejects.toThrow("Unknown profile field");
      expect(sqlMock).not.toHaveBeenCalled();
    },
  );
});

// --- Custom fields ---------------------------------------------------------

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";
const FOREIGN_ID = "99999999-9999-4999-8999-999999999999";

const row = (id: string, label: string) => ({ id, label, value: `v-${label}` });
const field = (id: string, label: string) => ({ id, label, value: `v-${label}` });
const ABC = [row(ID_A, "A"), row(ID_B, "B"), row(ID_C, "C")];

type Marker = unknown[] & { text: string; params: unknown[] };
// Rows returned if a statement is awaited outside the batch (the 23505 fallback read).
let fallbackRows: unknown[] = [];
const batch = () => sqlMock.transaction.mock.calls[0][0] as Marker[];

describe("custom fields service", () => {
  beforeEach(() => {
    sqlMock.mockReset();
    sqlMock.transaction.mockReset();
    fallbackRows = [];
    sqlMock.mockImplementation((strings: TemplateStringsArray, ...params: unknown[]) =>
      Object.assign([...fallbackRows], { text: [...strings].join("$").replace(/\s+/g, " ").trim(), params }),
    );
  });

  const respond = (mutationRows: unknown[], listRows: unknown[]) =>
    sqlMock.transaction.mockResolvedValueOnce([[], mutationRows, listRows]);

  it("getOwnCustomFields reads the user list ordered by position and maps rows", async () => {
    fallbackRows = ABC;
    expect(await getOwnCustomFields(USER_ID)).toEqual([field(ID_A, "A"), field(ID_B, "B"), field(ID_C, "C")]);
    expect(sqlMock).toHaveBeenCalledTimes(1);
    const [call] = sqlMock.mock.results.map((r) => r.value as Marker);
    expect(call.text).toMatch(/where user_id = \$ order by position$/);
    expect(call.params).toEqual([USER_ID]);
  });

  it.each([
    ["add", () => addOwnCustomField(USER_ID, { label: "L", value: "V" }), [{ id: ID_A }]],
    ["update", () => updateOwnCustomField(USER_ID, { id: ID_A, label: "L", value: "V" }), [{ id: ID_A }]],
    ["delete", () => deleteOwnCustomField(USER_ID, ID_A), [{ deleted: 1 }]],
    ["move", () => moveOwnCustomField(USER_ID, ID_A, "down"), []],
  ])("%s sends lock + one mutation + list, in that order, only with the actor id", async (_name, run, mutationRows) => {
    respond(mutationRows, ABC);
    await run();

    expect(sqlMock.transaction).toHaveBeenCalledTimes(1);
    const [lock, mutation, list] = batch();
    expect(batch()).toHaveLength(3);
    expect(lock.text).toBe("select pg_advisory_xact_lock(hashtextextended($::text, 0))");
    expect(lock.params).toEqual([USER_ID]);
    expect(mutation.text).toMatch(/user_profile_custom_fields/);
    expect(mutation.params).toContain(USER_ID);
    expect(list.text).toBe("select id, label, value from user_profile_custom_fields where user_id = $ order by position");
    expect(list.params).toEqual([USER_ID]);
    // No statement is built or awaited outside the batch.
    expect(sqlMock).toHaveBeenCalledTimes(3);
  });

  describe("add", () => {
    it("inserts conditionally at the end with the cap as a parameter and returns the final list", async () => {
      respond([{ id: ID_C }], ABC);
      const result = await addOwnCustomField(USER_ID, { label: "C", value: "v-C" });

      const mutation = batch()[1];
      expect(mutation.text).toBe(
        "insert into user_profile_custom_fields (user_id, label, value, position) select $, $, $, count(*) + 1 from user_profile_custom_fields where user_id = $ having count(*) < $ returning id",
      );
      expect(mutation.params).toEqual([USER_ID, "C", "v-C", USER_ID, 10]);
      expect(result).toEqual({ ok: true, customFields: [field(ID_A, "A"), field(ID_B, "B"), field(ID_C, "C")] });
    });

    it("returns limit when the conditional insert yields no row (10 fields)", async () => {
      respond([], ABC);
      expect(await addOwnCustomField(USER_ID, { label: "K", value: "v" })).toEqual({ ok: false, reason: "limit" });
    });
  });

  describe("update", () => {
    it("filters by id and user_id, does not touch position, and returns the list", async () => {
      respond([{ id: ID_B }], ABC);
      const result = await updateOwnCustomField(USER_ID, { id: ID_B, label: "B", value: "x" });

      const mutation = batch()[1];
      expect(mutation.text).toMatch(/where id = \$ and user_id = \$ returning id$/);
      expect(mutation.text).not.toMatch(/position/);
      expect(mutation.params).toEqual(["B", "x", ID_B, USER_ID]);
      expect(result.ok).toBe(true);
    });

    it("returns not_found for a foreign or missing id (zero rows)", async () => {
      respond([], ABC);
      expect(await updateOwnCustomField(USER_ID, { id: FOREIGN_ID, label: "B", value: "x" })).toEqual({
        ok: false,
        reason: "not_found",
      });
      expect(batch()[1].params).toEqual(["B", "x", FOREIGN_ID, USER_ID]);
    });
  });

  describe("delete", () => {
    it("deletes and compacts positions in a single statement, scoped to the actor", async () => {
      respond([{ deleted: 1 }], [row(ID_A, "A"), row(ID_C, "C")]);
      const result = await deleteOwnCustomField(USER_ID, ID_B);

      const mutation = batch()[1];
      expect(mutation.text).toMatch(
        /^with d as \(delete from user_profile_custom_fields where id = \$ and user_id = \$ returning position\)/,
      );
      expect(mutation.text).toMatch(/set position = position - 1/);
      expect(mutation.text).toMatch(/position > \(select position from d\)/);
      expect(mutation.text).toMatch(/select count\(\*\)::int as deleted from d$/);
      expect(mutation.params).toEqual([ID_B, USER_ID, USER_ID]);
      // The returned list is the compacted final state, in position order.
      expect(result).toEqual({ ok: true, customFields: [field(ID_A, "A"), field(ID_C, "C")] });
    });

    it("returns not_found when nothing was deleted (deleted = 0, foreign id)", async () => {
      respond([{ deleted: 0 }], ABC);
      expect(await deleteOwnCustomField(USER_ID, FOREIGN_ID)).toEqual({ ok: false, reason: "not_found" });
    });
  });

  describe("move", () => {
    it.each([
      ["up", -1],
      ["down", 1],
    ] as const)("%s sends delta %i from the closed map in one swap statement", async (direction, delta) => {
      respond([], [row(ID_B, "B"), row(ID_A, "A"), row(ID_C, "C")]);
      const result = await moveOwnCustomField(USER_ID, ID_A, direction);

      const mutation = batch()[1];
      expect(mutation.text).toMatch(
        /set position = case when id = \(select id from t\) then position \+ \$::int else position - \$::int end/,
      );
      expect(mutation.text).toMatch(
        /\(select count\(\*\) from user_profile_custom_fields where user_id = \$ and position = \(select p from t\) \+ \$::int\) = 1$/,
      );
      expect(mutation.params).toEqual([ID_A, USER_ID, delta, delta, USER_ID, delta, USER_ID, delta]);
      // The list reflects the swapped order.
      expect(result).toEqual({
        ok: true,
        customFields: [field(ID_B, "B"), field(ID_A, "A"), field(ID_C, "C")],
      });
    });

    it.each([
      ["up", ID_A],
      ["down", ID_C],
    ] as const)("is a no-op at an end (%s on %s): ok with the list unchanged", async (direction, id) => {
      respond([], ABC);
      expect(await moveOwnCustomField(USER_ID, id, direction)).toEqual({
        ok: true,
        customFields: [field(ID_A, "A"), field(ID_B, "B"), field(ID_C, "C")],
      });
    });

    it("returns not_found when the id is not in the actor list (foreign id)", async () => {
      respond([], ABC);
      expect(await moveOwnCustomField(USER_ID, FOREIGN_ID, "up")).toEqual({ ok: false, reason: "not_found" });
      expect(batch()[1].params).toContain(USER_ID);
    });
  });

  describe("atomicity and errors", () => {
    it.each([
      ["add", () => addOwnCustomField(USER_ID, { label: "L", value: "V" })],
      ["update", () => updateOwnCustomField(USER_ID, { id: ID_A, label: "L", value: "V" })],
      ["delete", () => deleteOwnCustomField(USER_ID, ID_A)],
      ["move", () => moveOwnCustomField(USER_ID, ID_A, "up")],
    ])("%s rethrows when the batch rejects, with no extra statement or separate read", async (_name, run) => {
      const failure = Object.assign(new Error("boom"), { code: "XX000" });
      sqlMock.transaction.mockRejectedValueOnce(failure);

      await expect(run()).rejects.toBe(failure);
      expect(sqlMock.transaction).toHaveBeenCalledTimes(1);
      // Only the three statements built for the batch; no partial state is read or returned.
      expect(sqlMock).toHaveBeenCalledTimes(3);
    });

    it("maps 23505 to duplicate_label when another field already has the same label key", async () => {
      fallbackRows = [row(ID_A, "Ubicación")];
      sqlMock.transaction.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));

      expect(await addOwnCustomField(USER_ID, { label: "ubicación", value: "v" })).toEqual({
        ok: false,
        reason: "duplicate_label",
      });
    });

    it("maps 23505 to conflict when no other field shares the label key", async () => {
      fallbackRows = [row(ID_A, "Otra")];
      sqlMock.transaction.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));

      expect(await addOwnCustomField(USER_ID, { label: "Ubicación", value: "v" })).toEqual({
        ok: false,
        reason: "conflict",
      });
    });

    it("on update ignores the own row when looking for a duplicate label", async () => {
      fallbackRows = [row(ID_A, "Ubicación")];
      sqlMock.transaction.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));

      expect(await updateOwnCustomField(USER_ID, { id: ID_A, label: "Ubicación", value: "v" })).toEqual({
        ok: false,
        reason: "conflict",
      });
    });

    it("maps 23505 on delete and move to conflict without a duplicate lookup", async () => {
      sqlMock.transaction.mockRejectedValue(Object.assign(new Error("dup"), { code: "23505" }));

      expect(await deleteOwnCustomField(USER_ID, ID_A)).toEqual({ ok: false, reason: "conflict" });
      expect(await moveOwnCustomField(USER_ID, ID_A, "down")).toEqual({ ok: false, reason: "conflict" });
      expect(sqlMock).toHaveBeenCalledTimes(6);
    });
  });
});
