import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock } = vi.hoisted(() => ({ sqlMock: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => sqlMock }));

import { PROFILE_FIELD_KEYS } from "../schemas/profile.schema";
import type { ProfileFieldKey } from "../types/profile.types";
import { getOwnProfile, setOwnProfileField } from "./profile.service";

const USER_ID = "row-1";

const COLUMNS: Record<ProfileFieldKey, string> = {
  phone: "phone",
  jobTitle: "job_title",
  company: "company",
  birthday: "birthday",
  website: "website",
  note: "note",
};

const dbRow = {
  phone: "600",
  job_title: "Cargo",
  company: null,
  birthday: "1990-03-12",
  website: null,
  note: null,
};

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
      jobTitle: null,
      company: null,
      birthday: null,
      website: null,
      note: null,
    });
  });

  it("reads only the given user's row, with the id as a parameter", async () => {
    sqlMock.mockResolvedValueOnce([dbRow]);

    expect(await getOwnProfile(USER_ID)).toEqual({
      phone: "600",
      jobTitle: "Cargo",
      company: null,
      birthday: "1990-03-12",
      website: null,
      note: null,
    });
    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(sqlText(sqlMock.mock.calls[0])).toMatch(/from user_profiles where user_id = \$\s*$/);
    expect(sqlMock.mock.calls[0].slice(1)).toEqual([USER_ID]);
  });
});

describe("setOwnProfileField", () => {
  it.each(PROFILE_FIELD_KEYS)("runs a single upsert for %s that only writes its own column", async (field) => {
    sqlMock.mockResolvedValueOnce([dbRow]);

    const profile = await setOwnProfileField(USER_ID, field, "valor");

    expect(sqlMock).toHaveBeenCalledTimes(1);
    const call = sqlMock.mock.calls[0];
    const text = sqlText(call);
    const column = COLUMNS[field];
    const [write] = text.split(" returning ");

    expect(text).not.toMatch(/\bselect\b/);
    expect(write.trim()).toBe(
      `insert into user_profiles (user_id, ${column}) values ($, $) on conflict (user_id) do update set ${column} = excluded.${column}, updated_at = now()`,
    );
    expect(call.slice(1)).toEqual([USER_ID, "valor"]);
    expect(profile).toEqual({
      phone: "600",
      jobTitle: "Cargo",
      company: null,
      birthday: "1990-03-12",
      website: null,
      note: null,
    });
  });

  it("uses a different statement for each field", async () => {
    sqlMock.mockResolvedValue([dbRow]);
    for (const field of PROFILE_FIELD_KEYS) {
      await setOwnProfileField(USER_ID, field, "x");
    }
    const statements = new Set(sqlMock.mock.calls.map((call) => call[0]));
    expect(statements.size).toBe(PROFILE_FIELD_KEYS.length);
  });

  it("passes null to clear the column", async () => {
    sqlMock.mockResolvedValueOnce([{ ...dbRow, phone: null }]);

    const profile = await setOwnProfileField(USER_ID, "phone", null);

    expect(sqlMock.mock.calls[0].slice(1)).toEqual([USER_ID, null]);
    expect(profile.phone).toBeNull();
  });

  it.each(["role", "__proto__", "toString", "user_id"])(
    "throws for a key outside the map (%s) without calling the database",
    async (field) => {
      await expect(setOwnProfileField(USER_ID, field as ProfileFieldKey, "x")).rejects.toThrow(
        "Unknown profile field",
      );
      expect(sqlMock).not.toHaveBeenCalled();
    },
  );
});
