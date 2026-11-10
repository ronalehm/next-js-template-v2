import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/lib/roles";
import type { ClerkActivity, UserRow } from "../types/users.types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("../actions/users.actions", () => ({
  activateUserAction: vi.fn(),
  resendInvitationAction: vi.fn(),
  revokeUserAction: vi.fn(),
  getUserSessionsAction: vi.fn().mockResolvedValue({ ok: true, activeSessions: 0 }),
}));
vi.mock("./InviteUserDialog", () => ({ InviteUserDialog: () => null }));
vi.mock("./EditUserDialog", () => ({ EditUserDialog: () => null }));
vi.mock("./DeleteUserDialog", () => ({ DeleteUserDialog: () => null }));
vi.mock("./RecoverUserDialog", () => ({ RecoverUserDialog: () => null }));
vi.mock("@/components/shared/UserAvatar", () => ({
  UserAvatar: ({ imageUrl }: { imageUrl?: string | null }) => <span data-testid="avatar" data-image={imageUrl ?? ""} />,
}));

import { UsersView } from "./UsersView";

const WARNING = "Identidad no encontrada";
const NOT_FOUND = { lastSignInAt: null, imageUrl: null, identity: "not_found" } as const;

function row(over: Partial<UserRow> & { id: string; role: Role }): UserRow {
  return {
    email: `${over.id}@example.com`,
    firstName: null,
    lastName: null,
    status: "active",
    linked: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function setup(actorRole: Role, rows: UserRow[], activity: ClerkActivity = {}) {
  render(
    <UsersView
      actor={{ id: "actor", role: actorRole }}
      page={{ rows, total: rows.length, page: 1, pageCount: 1 }}
      query={{ q: "", status: "all", role: "all", sort: "name", page: 1 }}
      activity={activity}
    />,
  );
}

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 50)));

async function openMenu(email: string) {
  fireEvent.click(screen.getByRole("button", { name: `Más acciones para ${email}` }));
  await flush();
}

async function openDetail(email: string) {
  fireEvent.click(screen.getByRole("button", { name: `Ver detalles de ${email}` }));
  await flush();
  return within(await screen.findByRole("dialog"));
}

describe("UsersView identity warning", () => {
  afterEach(cleanup);

  it("AC-13/AC-15: warns on an active not_found manageable row and offers Recuperar acceso", async () => {
    const u = row({ id: "u1", role: "user" });
    setup("admin", [u], { u1: NOT_FOUND });
    expect(screen.getAllByText(WARNING)).toHaveLength(1);
    await openMenu(u.email);
    expect(screen.getByRole("menuitem", { name: "Recuperar acceso" })).toBeTruthy();
  });

  it("AC-15: superadmin sees it on an admin row", () => {
    setup("superadmin", [row({ id: "a1", role: "admin" })], { a1: NOT_FOUND });
    expect(screen.getAllByText(WARNING)).toHaveLength(1);
  });

  it("AC-14: no warning for verified, unverified or unlinked", () => {
    setup(
      "admin",
      [row({ id: "v", role: "user" }), row({ id: "w", role: "user" }), row({ id: "x", role: "user", linked: false })],
      {
        v: { lastSignInAt: null, imageUrl: null, identity: "verified" },
        w: { lastSignInAt: null, imageUrl: null, identity: "unverified" },
        // unlinked row with a stray not_found entry must still not warn
        x: NOT_FOUND,
      },
    );
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it("AC-14: no warning for revoked or invited rows even with not_found", () => {
    setup(
      "admin",
      [row({ id: "r", role: "user", status: "revoked" }), row({ id: "i", role: "user", status: "invited", linked: false })],
      { r: NOT_FOUND, i: NOT_FOUND },
    );
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it("AC-16/AC-28: non-manageable rows show no warning, avatar, last access or recover, even with not_found", async () => {
    const admin = row({ id: "a1", role: "admin" });
    setup("admin", [admin, row({ id: "s1", role: "superadmin" })], {
      a1: { lastSignInAt: null, imageUrl: null, identity: "not_found" },
      s1: { lastSignInAt: null, imageUrl: null, identity: "not_found" },
    });
    expect(screen.queryByText(WARNING)).toBeNull();
    for (const avatar of screen.getAllByTestId("avatar")) expect(avatar.getAttribute("data-image")).toBe("");
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: `Más acciones para ${admin.email}` })).toBeNull();
  });

  it("AC-16: superadmin never sees the warning on superadmin rows", () => {
    setup("superadmin", [row({ id: "s1", role: "superadmin" })], { s1: NOT_FOUND });
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it("AC-16: the actor's own row has no warning or recover", async () => {
    const own = row({ id: "actor", role: "admin" });
    setup("admin", [own], { actor: NOT_FOUND });
    expect(screen.queryByText(WARNING)).toBeNull();
    expect(screen.queryByRole("button", { name: `Más acciones para ${own.email}` })).toBeNull();
  });

  it("AC-15: superadmin opens the menu of an admin row with not_found and sees Recuperar acceso", async () => {
    const a = row({ id: "a1", role: "admin" });
    setup("superadmin", [a], { a1: NOT_FOUND });
    await openMenu(a.email);
    expect(screen.getByRole("menuitem", { name: "Recuperar acceso" })).toBeTruthy();
  });

  it("AC-16/AC-28: superadmin on a superadmin row: no warning, avatar image, last access or menu", () => {
    const s = row({ id: "s1", role: "superadmin" });
    setup("superadmin", [s], { s1: NOT_FOUND });
    expect(screen.queryByText(WARNING)).toBeNull();
    for (const avatar of screen.getAllByTestId("avatar")) expect(avatar.getAttribute("data-image")).toBe("");
    expect(screen.getAllByText("—")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: `Más acciones para ${s.email}` })).toBeNull();
  });

  it("AC-16/AC-17: detail of the actor's own row has no Identidad", async () => {
    const own = row({ id: "actor", role: "admin" });
    setup("admin", [own], { actor: NOT_FOUND });
    const dialog = await openDetail(own.email);
    expect(dialog.queryByText("Identidad")).toBeNull();
    expect(dialog.queryByText("No encontrada")).toBeNull();
  });

  it("AC-16/AC-17: detail of a superadmin row (viewed by superadmin) has no Identidad", async () => {
    const s = row({ id: "s1", role: "superadmin" });
    setup("superadmin", [s], { s1: NOT_FOUND });
    const dialog = await openDetail(s.email);
    expect(dialog.queryByText("Identidad")).toBeNull();
    expect(dialog.queryByText("No encontrada")).toBeNull();
  });

  it.each([
    ["verified", "Verificada"],
    ["not_found", "No encontrada"],
    ["unverified", "Sin verificar"],
  ] as const)("AC-17: detail shows Identidad %s", async (identity, label) => {
    const u = row({ id: "u1", role: "user" });
    setup("admin", [u], { u1: { lastSignInAt: null, imageUrl: null, identity } });
    const dialog = await openDetail(u.email);
    expect(dialog.getByText("Identidad")).toBeTruthy();
    expect(dialog.getByText(label)).toBeTruthy();
  });

  it("AC-17: detail shows Sin vincular for an unlinked manageable row", async () => {
    const u = row({ id: "u1", role: "user", linked: false, status: "invited" });
    setup("admin", [u]);
    const dialog = await openDetail(u.email);
    expect(dialog.getByText("Sin vincular")).toBeTruthy();
  });

  it("AC-16/AC-17: detail of a non-manageable row has no Identidad", async () => {
    const a = row({ id: "a1", role: "admin" });
    setup("admin", [a], { a1: NOT_FOUND });
    const dialog = await openDetail(a.email);
    expect(dialog.queryByText("Identidad")).toBeNull();
    expect(dialog.queryByText("No encontrada")).toBeNull();
  });
});
