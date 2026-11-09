import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROLES, type Role } from "@/lib/roles";

const { authMock, getActorMock, redirectMock, canMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getActorMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
  canMock: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  SignInButton: ({ children }: { children: ReactNode }) => <>{children}</>,
  UserButton: () => null,
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/auth", () => ({ getActor: getActorMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/roles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/roles")>();
  return { ...actual, can: canMock };
});

import Home from "./page";

const actor = (role: Role) => ({ id: "row-1", clerkUserId: "user_123", email: "ana@example.com", role });

beforeEach(async () => {
  vi.clearAllMocks();
  const { can } = await vi.importActual<typeof import("@/lib/roles")>("@/lib/roles");
  canMock.mockImplementation(can);
  authMock.mockResolvedValue({ userId: "user_123" });
});

describe("Home", () => {
  it("AC-01: redirects an active superadmin to /dashboard", async () => {
    getActorMock.mockResolvedValue(actor("superadmin"));
    await expect(Home()).rejects.toThrow("REDIRECT /dashboard");
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });

  it.each(ROLES)("AC-02: redirects an active %s to /dashboard", async (role) => {
    getActorMock.mockResolvedValue(actor(role));
    await expect(Home()).rejects.toThrow("REDIRECT /dashboard");
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });

  it("AC-03: without a session shows sign-in and never calls getActor", async () => {
    authMock.mockResolvedValue({ userId: null });
    render(await Home());
    expect(screen.getByText("Iniciar sesión")).toBeTruthy();
    expect(getActorMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("AC-04: a session without an active actor stays on / with the no-access notice", async () => {
    getActorMock.mockResolvedValue(null);
    render(await Home());
    expect(screen.getByText(/Tu cuenta no tiene acceso/)).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("AC-05: an active actor without dashboard:view is not redirected", async () => {
    getActorMock.mockResolvedValue(actor("user"));
    canMock.mockReturnValue(false);
    render(await Home());
    expect(canMock).toHaveBeenCalledWith("user", "dashboard:view");
    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByText("Usuario")).toBeTruthy();
  });
});
