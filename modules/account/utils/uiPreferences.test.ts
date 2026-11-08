import { describe, expect, it } from "vitest";
import { DEFAULT_UI_PREFERENCES, parseUiPreferences, prefersDark } from "./uiPreferences";

describe("parseUiPreferences", () => {
  it("keeps valid values", () => {
    const valid = { theme: "dark", density: "compact", reduceMotion: true };
    expect(parseUiPreferences(valid)).toEqual(valid);
    expect(parseUiPreferences(JSON.stringify(valid))).toEqual(valid);
  });

  it.each([
    ["invalid JSON", "{nope"],
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["an array", ["dark"]],
    ["a JSON string literal", '"dark"'],
  ])("returns the defaults for %s", (_label, raw) => {
    expect(parseUiPreferences(raw)).toEqual(DEFAULT_UI_PREFERENCES);
  });

  it("replaces unknown or mistyped fields one by one", () => {
    expect(parseUiPreferences({ theme: "sepia", density: "compact", reduceMotion: "yes" })).toEqual({
      theme: "system",
      density: "compact",
      reduceMotion: false,
    });
  });

  it("ignores extra keys", () => {
    expect(parseUiPreferences({ theme: "light", density: "comfortable", reduceMotion: false, role: "superadmin" })).toEqual({
      theme: "light",
      density: "comfortable",
      reduceMotion: false,
    });
  });

  it("does not share the defaults object", () => {
    const parsed = parseUiPreferences(null);
    parsed.theme = "dark";
    expect(DEFAULT_UI_PREFERENCES.theme).toBe("system");
  });
});

describe("prefersDark", () => {
  it("follows the explicit theme or, with system, the OS setting", () => {
    expect(prefersDark("dark", false)).toBe(true);
    expect(prefersDark("light", true)).toBe(false);
    expect(prefersDark("system", true)).toBe(true);
    expect(prefersDark("system", false)).toBe(false);
  });
});
