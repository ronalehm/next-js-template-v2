import { describe, expect, it } from "vitest";
import {
  DEFAULT_PHONE_COUNTRY,
  PHONE_COUNTRIES,
  PHONE_TYPE_LABELS,
  PHONE_TYPES,
  formatPhone,
  phoneCountryLabel,
  splitPhone,
  toE164,
} from "./phone";

describe("phone countries and types", () => {
  it("keeps the D1 list and order, with Peru by default", () => {
    expect(PHONE_COUNTRIES.map(({ code, dialCode }) => `${code}+${dialCode}`)).toEqual([
      "PE+51",
      "AR+54",
      "BO+591",
      "BR+55",
      "CL+56",
      "CO+57",
      "EC+593",
      "MX+52",
      "ES+34",
      "US+1",
    ]);
    expect(DEFAULT_PHONE_COUNTRY).toBe("PE");
  });

  it("labels countries in Spanish with their prefix", () => {
    expect(phoneCountryLabel("PE")).toBe("Perú (+51)");
    expect(phoneCountryLabel("US")).toBe("Estados Unidos (+1)");
  });

  it("labels the three phone types", () => {
    expect(PHONE_TYPES.map((type) => PHONE_TYPE_LABELS[type])).toEqual(["Personal", "Trabajo", "Casa"]);
  });
});

describe("toE164", () => {
  it.each([
    ["PE", "987 654 321", "+51987654321"],
    ["PE", "987-654-321", "+51987654321"],
    ["ES", "600 123 456", "+34600123456"],
    ["US", "(415) 555-2671", "+14155552671"],
    ["BO", "71234567", "+59171234567"],
  ] as const)("%s + %s gives %s", (country, national, expected) => {
    expect(toE164(country, national)).toBe(expected);
  });

  it.each([
    ["letters", "PE", "987 ABC 321"],
    ["a plus sign", "PE", "+51987654321"],
    ["fewer than 7 digits in total", "PE", "1234"],
    ["more than 15 digits in total", "PE", "1234567890123456"],
  ] as const)("returns null with %s", (_name, country, national) => {
    expect(toE164(country, national)).toBeNull();
  });
});

describe("formatPhone", () => {
  it("groups a Peruvian mobile 3-3-3", () => {
    expect(formatPhone("+51987654321")).toBe("987 654 321");
  });

  it.each(["+5114261234", "+34600123456", "600 12 34 56"])("returns %s unchanged", (stored) => {
    expect(formatPhone(stored)).toBe(stored);
  });
});

describe("splitPhone", () => {
  it.each([
    ["+51987654321", "PE", "987654321"],
    ["+59171234567", "BO", "71234567"],
    ["+14155552671", "US", "4155552671"],
    ["+34 600 123 456", "ES", "600123456"],
    ["600 123 456", "PE", "600 123 456"],
    ["+447911123456", "PE", "+447911123456"],
  ])("splits %s into %s and %s", (stored, country, national) => {
    expect(splitPhone(stored)).toEqual({ country, national });
  });
});
