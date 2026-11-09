import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addCustomFieldInputSchema,
  customLabelKey,
  deleteCustomFieldInputSchema,
  moveCustomFieldInputSchema,
  profileFieldInputSchema,
  RESERVED_LABELS,
  updateCustomFieldInputSchema,
} from "./profile.schema";

const parse = (input: unknown) => profileFieldInputSchema.safeParse(input);

const phone = (value: Record<string, unknown>) => ({
  field: "phone",
  value: { country: "PE", national: "987654321", type: "personal", ...value },
});

afterEach(() => {
  vi.useRealTimers();
});

describe("profileFieldInputSchema", () => {
  it.each([
    ["jobTitle", " Diseñadora ", "Diseñadora"],
    ["company", " Acme ", "Acme"],
    ["birthday", " 1990-03-12 ", "1990-03-12"],
    ["website", " https://example.com/me ", "https://example.com/me"],
    ["note", "  Hola\nmundo  ", "Hola\nmundo"],
  ])("accepts a valid %s and trims it", (field, value, expected) => {
    expect(parse({ field, value })).toEqual({ success: true, data: { field, value: expected } });
  });

  it.each(["jobTitle", "company", "birthday", "website", "note"])("turns empty, blank or null %s into null", (field) => {
    for (const value of ["", "   ", null]) {
      expect(parse({ field, value })).toEqual({ success: true, data: { field, value: null } });
    }
  });

  it("accepts http websites and the length limits", () => {
    expect(parse({ field: "website", value: "http://example.com" }).success).toBe(true);
    expect(parse({ field: "jobTitle", value: "a".repeat(100) }).success).toBe(true);
    expect(parse({ field: "note", value: "a".repeat(500) }).success).toBe(true);
    expect(parse({ field: "birthday", value: "1900-01-01" }).success).toBe(true);
  });

  it.each([
    ["job title over 100", "jobTitle", "a".repeat(101)],
    ["company over 100", "company", "a".repeat(101)],
    ["invalid date format", "birthday", "12/03/1990"],
    ["impossible date", "birthday", "1990-02-30"],
    ["date before 1900", "birthday", "1899-12-31"],
    ["javascript: url", "website", "javascript:alert(1)"],
    ["ftp: url", "website", "ftp://example.com"],
    ["mailto: url", "website", "mailto:a@b.com"],
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
    expect(parse({ ...phone({}), userId: "someone-else" }).success).toBe(false);
    expect(parse({ field: "note", value: "x", userId: "someone-else" }).success).toBe(false);
  });

  it("rejects a non-string value and a missing value", () => {
    expect(parse({ field: "note", value: 600 }).success).toBe(false);
    expect(parse({ field: "note" }).success).toBe(false);
    expect(parse({ field: "phone" }).success).toBe(false);
    expect(parse({ field: "phone", value: "987654321" }).success).toBe(false);
  });
});

describe("profileFieldInputSchema: phone (R3)", () => {
  it("normalizes a Peruvian number to E.164 and keeps the type", () => {
    expect(parse(phone({ national: " 987 654 321 " }))).toEqual({
      success: true,
      data: { field: "phone", value: { phone: "+51987654321", type: "personal" } },
    });
  });

  it("gives another country's E.164 without grouping", () => {
    expect(parse(phone({ country: "ES", national: "600 123 456", type: "work" }))).toEqual({
      success: true,
      data: { field: "phone", value: { phone: "+34600123456", type: "work" } },
    });
  });

  it.each([null, { country: "PE", national: "", type: "home" }, { country: "PE", national: "   ", type: "home" }])(
    "turns %j into null",
    (value) => {
      expect(parse({ field: "phone", value })).toEqual({ success: true, data: { field: "phone", value: null } });
    },
  );

  it.each([
    ["letters", { national: "987 ABC 321" }, "Usa solo dígitos, espacios y ( ) - ."],
    ["a plus sign in the national number", { national: "+51987654321" }, "Usa solo dígitos, espacios y ( ) - ."],
    ["fewer than 7 digits in total", { national: "1234" }, "Número no válido."],
    ["more than 15 digits in total", { national: "1234567890123456" }, "Número no válido."],
  ])("rejects %s on the number, under value", (_name, value, message) => {
    const result = parse(phone(value));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ message, path: ["value", "national"] });
  });

  it.each([
    ["country XX", phone({ country: "XX" })],
    ["type mobile", phone({ type: "mobile" })],
    ["a missing type", { field: "phone", value: { country: "PE", national: "987654321" } }],
    ["an extra key inside value", phone({ extension: "12" })],
  ])("rejects %s", (_name, input) => {
    expect(parse(input).success).toBe(false);
  });
});

describe("profileFieldInputSchema: website without scheme (R4)", () => {
  it.each([
    ["example.com", "https://example.com"],
    ["example.com:8080", "https://example.com:8080"],
    ["www.example.com/me", "https://www.example.com/me"],
    ["//example.com", "https://example.com"],
    [" https://example.com ", "https://example.com"],
    ["HTTP://example.com", "HTTP://example.com"],
  ])("accepts %s as %s", (value, expected) => {
    expect(parse({ field: "website", value })).toEqual({ success: true, data: { field: "website", value: expected } });
  });

  // The 200 limit counts the "https://" prefix (8 characters).
  it("accepts 192 characters, 200 once prefixed", () => {
    const value = `example.com/${"a".repeat(180)}`;
    expect(parse({ field: "website", value })).toEqual({
      success: true,
      data: { field: "website", value: `https://${value}` },
    });
  });

  it("rejects 193 characters, 201 once prefixed", () => {
    const result = parse({ field: "website", value: `example.com/${"a".repeat(181)}` });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Máximo 200 caracteres.");
  });
});

describe("custom field schemas", () => {
  const add = (input: unknown) => addCustomFieldInputSchema.safeParse(input);
  const label = (value: string) => add({ label: value, value: "x" });
  const value = (v: string) => add({ label: "Ubicación", value: v });
  const id = "123e4567-e89b-42d3-a456-426614174000";

  it("normalizes the label: trim, collapsed spaces and NFC", () => {
    expect(label("  Mi   dato   extra ").data?.label).toBe("Mi dato extra");
    expect(label("Ubicación").data?.label).toBe("Ubicación");
  });

  it("accepts Ubicación and 40 characters; rejects empty and 41", () => {
    expect(label("Ubicación").success).toBe(true);
    expect(label("a".repeat(40)).success).toBe(true);
    expect(label("   ").error?.issues[0].message).toBe("Escribe una etiqueta.");
    expect(label("a".repeat(41)).error?.issues[0].message).toBe("Máximo 40 caracteres.");
  });

  it.each(["teléfono", "CARGO", "Sitio Web", "Correo", "Nombre", "Apellido", "NOTA PERSONAL", "Cumpleanos", " empresa "])(
    "rejects reserved label %s",
    (name) => {
      expect(label(name).error?.issues[0].message).toBe("Esa etiqueta ya existe en tu perfil. Usa otra.");
    },
  );

  it("reserves every fixed label", () => {
    for (const name of RESERVED_LABELS) expect(label(name).success).toBe(false);
  });

  it("does not treat Ubicación and ubicacion as duplicates of each other by key", () => {
    expect(customLabelKey("Ubicación")).toBe(customLabelKey("UBICACIÓN"));
    expect(customLabelKey("Ubicación")).not.toBe(customLabelKey("Ubicacion"));
  });

  it.each(["a\nb", "a\rb", "a\tb", "a\u2028b", "a\u2029b", "a\u0000b"])("rejects control or line separator in label %j", (name) => {
    expect(label(name).error?.issues[0].message).toBe("La etiqueta debe ser de una sola línea.");
  });

  it("trims the value and accepts 200 characters", () => {
    expect(value("  hola ").data?.value).toBe("hola");
    expect(value("a".repeat(200)).success).toBe(true);
  });

  it.each([
    ["201 characters", "a".repeat(201), "Máximo 200 caracteres."],
    ["empty", "", "Escribe un valor."],
    ["blank", "   ", "Escribe un valor."],
    ["a trailing newline", "a\n", "El valor debe ser de una sola línea."],
    ["a carriage return", "a\rb", "El valor debe ser de una sola línea."],
    ["a line separator", "a\u2028b", "El valor debe ser de una sola línea."],
    ["a paragraph separator", "a\u2029b", "El valor debe ser de una sola línea."],
  ])("rejects a value with %s", (_name, v, message) => {
    expect(value(v).error?.issues[0].message).toBe(message);
  });

  it("update rejects an empty value and a non-uuid id", () => {
    expect(updateCustomFieldInputSchema.safeParse({ id, label: "Ubicación", value: "" }).error?.issues[0].message).toBe(
      "Escribe un valor.",
    );
    expect(updateCustomFieldInputSchema.safeParse({ id: "nope", label: "Ubicación", value: "x" }).success).toBe(false);
    expect(updateCustomFieldInputSchema.safeParse({ id, label: "  Ubicación ", value: " x " }).data).toEqual({
      id,
      label: "Ubicación",
      value: "x",
    });
  });

  it("validates delete and move input", () => {
    expect(deleteCustomFieldInputSchema.safeParse({ id }).success).toBe(true);
    expect(deleteCustomFieldInputSchema.safeParse({ id: "nope" }).success).toBe(false);
    expect(moveCustomFieldInputSchema.safeParse({ id, direction: "up" }).success).toBe(true);
    expect(moveCustomFieldInputSchema.safeParse({ id, direction: "left" }).success).toBe(false);
  });

  it("rejects extra keys such as userId in all four schemas", () => {
    expect(add({ label: "Ubicación", value: "x", userId: "other" }).success).toBe(false);
    expect(updateCustomFieldInputSchema.safeParse({ id, label: "Ubicación", value: "x", userId: "o" }).success).toBe(false);
    expect(deleteCustomFieldInputSchema.safeParse({ id, userId: "o" }).success).toBe(false);
    expect(moveCustomFieldInputSchema.safeParse({ id, direction: "up", userId: "o" }).success).toBe(false);
  });
});
