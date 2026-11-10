import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "./next.config";

async function headersFor(env: string) {
  vi.stubEnv("NODE_ENV", env);
  const rules = await nextConfig.headers!();
  expect(rules).toHaveLength(1);
  expect(rules[0].source).toBe("/(.*)");
  return Object.fromEntries(rules[0].headers.map((h) => [h.key, h.value]));
}

const base = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

describe("next.config headers", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("production: five headers with exact values", async () => {
    expect(await headersFor("production")).toEqual({
      ...base,
      "Strict-Transport-Security": "max-age=31536000",
    });
  });

  it.each(["development", "test"])("%s: no HSTS, other four present", async (env) => {
    expect(await headersFor(env)).toEqual(base);
  });

  it("never sends an enforcing CSP", async () => {
    for (const env of ["production", "development"]) {
      expect(await headersFor(env)).not.toHaveProperty("Content-Security-Policy");
    }
  });
});
