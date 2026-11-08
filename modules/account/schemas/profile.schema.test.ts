import { afterEach, describe, expect, it, vi } from "vitest";
import { profileFieldInputSchema } from "./profile.schema";

const parse = (input: unknown) => profileFieldInputSchema.safeParse(input);

afterEach(() => {
  vi.useRealTimers();
});

describe("profileFieldInputSchema", () => {
  it.each([
    ["phone", "  +34 (600) 12-34.56 ", "+34 (600) 12-34.56"],
    ["jobTitle", " Diseñadora ", "Diseñadora"],
    ["company", " Acme ", "Acme"],
    ["birthday", " 1990-03-12 ", "1990-03-12"],
    ["website", " https://example.com/me ", "https://example.com/me"],
    ["note", "  Hola\nmundo  ", "Hola\nmundo"],
  ])("accepts a valid %s and trims it", (field, value, expected) => {
    expect(parse({ field, value })).toEqual({ success: true, data: { field, value: expected } });
  });

  it.each(["phone", "jobTitle", "company", "birthday", "website", "note"])(
    "turns empty, blank or null %s into null",
    (field) => {
      for (const value of ["", "   ", null]) {
        expect(parse({ field, value })).toEqual({ success: true, data: { field, value: null } });
      }
    },
  );

  it("accepts http websites and the length limits", () => {
    expect(parse({ field: "website", value: "http://example.com" }).success).toBe(true);
    expect(parse({ field: "phone", value: "1".repeat(30) }).success).toBe(true);
    expect(parse({ field: "jobTitle", value: "a".repeat(100) }).success).toBe(true);
    expect(parse({ field: "note", value: "a".repeat(500) }).success).toBe(true);
    expect(parse({ field: "birthday", value: "1900-01-01" }).success).toBe(true);
  });

  it.each([
    ["phone with letters", "phone", "600 ABC 123"],
    ["phone over 30", "phone", "1".repeat(31)],
    ["job title over 100", "jobTitle", "a".repeat(101)],
    ["company over 100", "company", "a".repeat(101)],
    ["invalid date format", "birthday", "12/03/1990"],
    ["impossible date", "birthday", "1990-02-30"],
    ["date before 1900", "birthday", "1899-12-31"],
    ["javascript: url", "website", "javascript:alert(1)"],
    ["ftp: url", "website", "ftp://example.com"],
    ["url without protocol", "website", "example.com"],
    ["url over 200", "website", `https://example.com/${"a".repeat(181)}`],
    ["note over 500", "note", "a".repeat(501)],
  ])("rejects %s", (_name, field, value) => {
    const result = parse({ field, value });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/[a-záéíóú]/i);
  });

  it("rejects a future birthday, evaluated at parse time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 8, 12));
    expect(parse({ field: "birthday", value: "2026-11-08" }).success).toBe(true);
    expect(parse({ field: "birthday", value: "2026-11-09" }).success).toBe(false);
  });

  it("rejects an unknown field", () => {
    expect(parse({ field: "role", value: "admin" }).success).toBe(false);
  });

  it("rejects extra keys such as a user id", () => {
    expect(parse({ field: "phone", value: "600", userId: "someone-else" }).success).toBe(false);
  });

  it("rejects a non-string value and a missing value", () => {
    expect(parse({ field: "phone", value: 600 }).success).toBe(false);
    expect(parse({ field: "phone" }).success).toBe(false);
  });
});
