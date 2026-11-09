import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { CustomField } from "../types/profile.types";

const { addMock, updateMock, deleteMock, moveMock } = vi.hoisted(() => ({
  addMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  moveMock: vi.fn(),
}));

vi.mock("../actions/profile.actions", () => ({
  addCustomFieldAction: addMock,
  updateCustomFieldAction: updateMock,
  deleteCustomFieldAction: deleteMock,
  moveCustomFieldAction: moveMock,
}));

import { CustomFieldForm } from "./CustomFieldForm";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";
const A: CustomField = { id: ID_A, label: "Ubicación", value: "Lima" };
const B: CustomField = { id: ID_B, label: "Hobby", value: "Ajedrez" };
const C: CustomField = { id: ID_C, label: "Mascota", value: "Perro" };

const onSaved = vi.fn();
const onCancel = vi.fn();

// Holds the list like ProfileView does, so a move re-renders the form with the new order.
function Host({ initial, id }: { initial: CustomField[]; id: string | null }) {
  const [fields, setFields] = useState(initial);
  return (
    <Dialog open>
      <DialogContent>
        <CustomFieldForm fields={fields} id={id} onChange={setFields} onSaved={onSaved} onCancel={onCancel} />
      </DialogContent>
    </Dialog>
  );
}

const input = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const click = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
};

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("CustomFieldForm", () => {
  it("AC-26/AC-15: an empty value is rejected on the client without calling any action", async () => {
    render(<Host initial={[]} id={null} />);
    fireEvent.change(input("Etiqueta"), { target: { value: "Ubicación" } });
    await click("Guardar");
    expect(screen.getByText("Escribe un valor.")).toBeTruthy();
    expect(addMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("AC-15: clearing the value of an existing field is rejected, not deleted", async () => {
    render(<Host initial={[A]} id={ID_A} />);
    fireEvent.change(input("Valor"), { target: { value: "   " } });
    await click("Guardar");
    expect(screen.getByText("Escribe un valor.")).toBeTruthy();
    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("rejects an empty label and a value over 200 characters or with a line separator", async () => {
    render(<Host initial={[]} id={null} />);
    fireEvent.change(input("Valor"), { target: { value: "a".repeat(201) } });
    await click("Guardar");
    expect(screen.getByText("Escribe una etiqueta.")).toBeTruthy();
    expect(screen.getByText("Máximo 200 caracteres.")).toBeTruthy();

    fireEvent.change(input("Valor"), { target: { value: `uno${String.fromCharCode(0x2028)}dos` } });
    await click("Guardar");
    expect(screen.getByText("El valor debe ser de una sola línea.")).toBeTruthy();
    expect(addMock).not.toHaveBeenCalled();
  });

  it("AC-01: a valid new field calls addCustomFieldAction with the raw input and hands the list to onSaved", async () => {
    addMock.mockResolvedValue({ ok: true, customFields: [A] });
    render(<Host initial={[]} id={null} />);
    fireEvent.change(input("Etiqueta"), { target: { value: "  Ubicación " } });
    fireEvent.change(input("Valor"), { target: { value: "Lima" } });
    await click("Guardar");
    expect(addMock).toHaveBeenCalledWith({ label: "  Ubicación ", value: "Lima" });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith([A]));
  });

  it("AC-21: a server error keeps the dialog content and shows the message", async () => {
    updateMock.mockResolvedValue({ ok: false, error: "Ya tienes un campo con esa etiqueta." });
    render(<Host initial={[A]} id={ID_A} />);
    fireEvent.change(input("Valor"), { target: { value: "Cusco" } });
    await click("Guardar");
    expect(await screen.findByText("Ya tienes un campo con esa etiqueta.")).toBeTruthy();
    expect(input("Valor").value).toBe("Cusco");
    expect(input("Etiqueta").value).toBe("Ubicación");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("AC-15: Eliminar calls deleteCustomFieldAction", async () => {
    deleteMock.mockResolvedValue({ ok: true, customFields: [] });
    render(<Host initial={[A]} id={ID_A} />);
    await click("Eliminar");
    expect(deleteMock).toHaveBeenCalledWith({ id: ID_A });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith([]));
  });

  it("a new field offers no Eliminar and no move controls", () => {
    render(<Host initial={[A]} id={null} />);
    expect(screen.queryByRole("button", { name: "Eliminar" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Subir/ })).toBeNull();
  });

  it("AC-24: Subir and Bajar carry the field name and are disabled at the ends", () => {
    const { unmount } = render(<Host initial={[A, B, C]} id={ID_A} />);
    expect((screen.getByRole("button", { name: "Subir «Ubicación»" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Bajar «Ubicación»" }) as HTMLButtonElement).disabled).toBe(false);
    unmount();

    render(<Host initial={[A, B, C]} id={ID_C} />);
    expect((screen.getByRole("button", { name: "Subir «Mascota»" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Bajar «Mascota»" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("AC-13/AC-24: moving calls the action, announces the position and keeps focus on the pressed button", async () => {
    moveMock.mockResolvedValue({ ok: true, customFields: [A, B, C] });
    render(<Host initial={[A, B, C]} id={ID_B} />);
    // B is at position 2 of 3; the mock puts it at 2 (the server decides), pressing keeps both enabled.
    await click("Bajar «Hobby»");
    expect(moveMock).toHaveBeenCalledWith({ id: ID_B, direction: "down" });
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("«Hobby» movido a la posición 2 de 3"));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Bajar «Hobby»" }));
  });

  it("AC-24: when the moved field reaches an end, focus passes to the opposite button", async () => {
    moveMock.mockResolvedValue({ ok: true, customFields: [A, C, B] });
    render(<Host initial={[A, B, C]} id={ID_B} />);
    await click("Bajar «Hobby»");
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("«Hobby» movido a la posición 3 de 3"));
    const down = screen.getByRole("button", { name: "Bajar «Hobby»" }) as HTMLButtonElement;
    const up = screen.getByRole("button", { name: "Subir «Hobby»" });
    expect(down.disabled).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(up));
  });

  it("a move error is shown next to the controls and announced", async () => {
    moveMock.mockResolvedValue({ ok: false, error: "El campo ya no existe." });
    render(<Host initial={[A, B]} id={ID_A} />);
    await click("Bajar «Ubicación»");
    expect((await screen.findAllByText("El campo ya no existe.")).length).toBe(2);
    expect(screen.getByRole("status").textContent).toBe("El campo ya no existe.");
  });

  it("AC-12: HTML-like values are plain input text, never interpreted", () => {
    render(<Host initial={[{ ...A, value: "<img src=x onerror=alert(1)>" }]} id={ID_A} />);
    expect(input("Valor").value).toBe("<img src=x onerror=alert(1)>");
    expect(document.querySelector("img")).toBeNull();
  });
});
