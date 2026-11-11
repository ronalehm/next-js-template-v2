import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRow } from "../types/users.types";

const deleteUserAction = vi.hoisted(() => vi.fn());
vi.mock("../actions/users.actions", () => ({ deleteUserAction }));

import { DeleteUserDialog } from "./DeleteUserDialog";

const ROW: UserRow = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ana@example.com",
  firstName: null,
  lastName: null,
  role: "user",
  status: "active",
  linked: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function setup(overrides: Partial<Parameters<typeof DeleteUserDialog>[0]> = {}) {
  const props = { row: ROW, open: true, onOpenChange: vi.fn(), onDone: vi.fn(), finalFocus: () => null, ...overrides };
  render(<DeleteUserDialog {...props} />);
  return props;
}

const deleteButton = () => screen.getByRole("button", { name: "Eliminar" });
const type = (value: string) => fireEvent.change(input(), { target: { value } });
const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled || el.hasAttribute("data-disabled") || el.getAttribute("aria-disabled") === "true";
const cancelButton = () => screen.getByRole("button", { name: "Cancelar" });
const waitIdle = () => waitFor(() => expect(isDisabled(cancelButton())).toBe(false));
const click = (el: HTMLElement) => fireEvent.click(el);
const input = () => screen.getByLabelText("Escribe el correo para confirmar");

describe("DeleteUserDialog", () => {
  beforeEach(() => deleteUserAction.mockReset());
  afterEach(cleanup);

  it("AC-15: enables Eliminar only when the typed email matches (trim, case-insensitive)", async () => {
    setup();
    expect(isDisabled(deleteButton())).toBe(true);
    type("otra@example.com");
    expect(isDisabled(deleteButton())).toBe(true);
    type("  ANA@Example.com ");
    expect(isDisabled(deleteButton())).toBe(false);
  });

  it("calls deleteUserAction with id and email, then onDone", async () => {
    deleteUserAction.mockResolvedValue({ ok: true });
    const props = setup();
    type(ROW.email);
    click(deleteButton());
    await waitFor(() => expect(props.onDone).toHaveBeenCalledWith("Usuario eliminado."));
    await waitIdle();
    expect(deleteUserAction).toHaveBeenCalledWith({ id: ROW.id, email: ROW.email });
  });

  it("AC-16: disables both buttons while pending", async () => {
    let resolve!: (value: { ok: true }) => void;
    deleteUserAction.mockReturnValue(new Promise((r) => (resolve = r)));
    const props = setup();
    type(ROW.email);
    click(deleteButton());
    await waitFor(() => {
      expect(isDisabled(deleteButton())).toBe(true);
      expect(isDisabled(cancelButton())).toBe(true);
    });
    resolve({ ok: true });
    await waitFor(() => expect(props.onDone).toHaveBeenCalledWith("Usuario eliminado."));
    await waitIdle();
  });

  it("AC-16: shows the error (PARTIAL_DELETE / CHANGED) in role=alert and stays open", async () => {
    const message = "La cuenta se eliminó, pero el registro del panel no. Vuelve a intentarlo.";
    deleteUserAction.mockResolvedValue({ ok: false, error: message });
    const props = setup();
    type(ROW.email);
    click(deleteButton());
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    await waitIdle();
    expect(props.onDone).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it("AC-16: clears text and error when closed", async () => {
    deleteUserAction.mockResolvedValue({ ok: false, error: "El usuario cambió mientras tanto. Recarga la página." });
    const props = setup();
    type(ROW.email);
    click(deleteButton());
    await screen.findByRole("alert");
    await waitIdle();
    click(cancelButton());
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect((input() as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
