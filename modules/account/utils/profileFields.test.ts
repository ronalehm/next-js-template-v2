import { describe, expect, it } from "vitest";
import { formatProfileValue, OPTIONAL_PROFILE_FIELDS, PROFILE_FIELD_LABELS } from "./profileFields";

describe("profileFields", () => {
  it("lists the optional fields in R30 order", () => {
    expect(OPTIONAL_PROFILE_FIELDS.map((key) => PROFILE_FIELD_LABELS[key])).toEqual([
      "Cargo",
      "Empresa",
      "Cumpleaños",
      "Sitio web",
      "Nota personal",
    ]);
  });

  it("formats the birthday as a long Spanish date", () => {
    expect(formatProfileValue("birthday", "1990-03-12")).toBe("12 de marzo de 1990");
    expect(formatProfileValue("birthday", "2000-01-01")).toBe("1 de enero de 2000");
  });

  it.each([
    ["phone", "+34 600 123 456"],
    ["jobTitle", "Diseñadora"],
    ["company", "Acme"],
    ["website", "https://example.com"],
    ["note", "<b>texto</b>"],
  ] as const)("returns %s unchanged", (key, value) => {
    expect(formatProfileValue(key, value)).toBe(value);
  });
});
