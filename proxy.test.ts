import { beforeEach, describe, expect, it, vi } from "vitest";

const protect = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: unknown, options: unknown) => ({ handler, options }),
  createRouteMatcher: (patterns: string[]) => {
    const res = patterns.map((p) => new RegExp(`^${p}$`));
    return (req: { nextUrl: { pathname: string } }) =>
      res.some((r) => r.test(req.nextUrl.pathname));
  },
}));

const req = (pathname: string) => ({ nextUrl: { pathname } });

describe("proxy", () => {
  beforeEach(() => protect.mockClear());

  it("passes a Report-Only CSP, without strict", async () => {
    const { default: mw } = await import("./proxy");
    const { options } = mw as unknown as {
      options: { contentSecurityPolicy: Record<string, unknown> };
    };
    const csp = options.contentSecurityPolicy;
    expect(csp.reportOnly).toBe(true);
    expect(csp).not.toHaveProperty("strict");
    expect(csp.directives).toEqual({
      "object-src": ["none"],
      "base-uri": ["self"],
      "frame-ancestors": ["none"],
    });
  });

  it("protects /dashboard and leaves public routes alone", async () => {
    const { default: mw } = await import("./proxy");
    const { handler } = mw as unknown as {
      handler: (a: { protect: typeof protect }, r: unknown) => Promise<void>;
    };
    await handler({ protect }, req("/dashboard/users"));
    expect(protect).toHaveBeenCalledTimes(1);
    await handler({ protect }, req("/"));
    expect(protect).toHaveBeenCalledTimes(1);
  });
});
