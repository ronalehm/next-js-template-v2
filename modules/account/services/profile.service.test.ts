import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock } = vi.hoisted(() => ({ sqlMock: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => sqlMock }));

import type { ProfileFieldValue } from "../types/profile.types";
import { getOwnProfile, setOwnProfileField } from "./profile.service";

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
