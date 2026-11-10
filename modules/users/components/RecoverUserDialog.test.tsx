import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRow } from "../types/users.types";

const recoverUserAccessAction = vi.hoisted(() => vi.fn());
vi.mock("../actions/users.actions", () => ({ recoverUserAccessAction }));

import { RecoverUserDialog } from "./RecoverUserDialog";

const USER: UserRow = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ana@example.com",
  firstName: null,
  lastName: null,
  role: "user",
  status: "active",
  linked: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};
const ADMIN: UserRow = { ...USER, role: "admin" };

function setup(row: UserRow = USER) {
  const props = { row, open: true, onOpenChange: vi.fn(), onDone: vi.fn(), finalFocus: () => null };
  render(<RecoverUserDialog {...props} />);
  return props;
}

const confirmButton = () => screen.getByRole("button", { name: "Recuperar acceso" });
const checkbox = () => screen.getByLabelText(/verifiqué la identidad/);
const isDisabled = (el: HTMLElement) =>
  (el as HTMLButtonElement).disabled || el.hasAttribute("data-disabled") || el.getAttribute("aria-disabled") === "true";
const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 50)));

describe("RecoverUserDialog", () => {
  beforeEach(() => recoverUserAccessAction.mockReset());
  afterEach(cleanup);

  it("AC-23: admin row requires the identity checkbox before confirming", () => {
    setup(ADMIN);
    expect(isDisabled(confirmButton())).toBe(true);
    fireEvent.click(checkbox());
    expect(isDisabled(confirmButton())).toBe(false);
  });

  it("AC-23: user row shows no checkbox and can confirm directly", () => {
    setup();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(isDisabled(confirmButton())).toBe(false);
  });

  it("sends only { id } for user rows, then onDone", async () => {
    recoverUserAccessAction.mockResolvedValue({ ok: true });
    const props = setup();
    fireEvent.click(confirmButton());
    await flush();
    expect(recoverUserAccessAction).toHaveBeenCalledWith({ id: USER.id });
    expect(props.onDone).toHaveBeenCalled();
  });

  it("sends { id, identityVerified: true } for admin rows", async () => {
    recoverUserAccessAction.mockResolvedValue({ ok: true });
    setup(ADMIN);
    fireEvent.click(checkbox());
    fireEvent.click(confirmButton());
    await flush();
    expect(recoverUserAccessAction).toHaveBeenCalledWith({ id: ADMIN.id, identityVerified: true });
  });

  it("shows the action error in role=alert and stays open", async () => {
    const message = "La cuenta todavía existe en Clerk.";
    recoverUserAccessAction.mockResolvedValue({ ok: false, error: message });
    const props = setup();
    fireEvent.click(confirmButton());
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(props.onDone).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it("disables both buttons while pending", async () => {
    let resolve!: (value: { ok: true }) => void;
    recoverUserAccessAction.mockReturnValue(new Promise((r) => (resolve = r)));
    setup();
    fireEvent.click(confirmButton());
    await flush();
    expect(isDisabled(confirmButton())).toBe(true);
    expect(isDisabled(screen.getByRole("button", { name: "Cancelar" }))).toBe(true);
    resolve({ ok: true });
  });
});
