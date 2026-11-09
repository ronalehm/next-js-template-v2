import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  can: vi.fn(),
  add: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  move: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getActor: mocks.getActor }));
vi.mock("@/lib/roles", () => ({ can: mocks.can }));
vi.mock("../services/profile.service", () => ({
  setOwnProfileField: vi.fn(),
  addOwnCustomField: mocks.add,
  updateOwnCustomField: mocks.update,
  deleteOwnCustomField: mocks.del,
  moveOwnCustomField: mocks.move,
}));

import {
  addCustomFieldAction,
  deleteCustomFieldAction,
  moveCustomFieldAction,
  updateCustomFieldAction,
} from "./profile.actions";

const ACTOR_ID = "actor-1";
const ID = "11111111-1111-4111-8111-111111111111";
const GENERIC = "No se pudo guardar. Inténtalo de nuevo.";
const LIST = [{ id: ID, label: "Ubicación", value: "Lima" }];

const CASES = [
  { name: "add", action: addCustomFieldAction, service: mocks.add, input: { label: "Ubicación", value: "Lima" } },
  { name: "update", action: updateCustomFieldAction, service: mocks.update, input: { id: ID, label: "Ubicación", value: "Lima" } },
  { name: "delete", action: deleteCustomFieldAction, service: mocks.del, input: { id: ID } },
  { name: "move", action: moveCustomFieldAction, service: mocks.move, input: { id: ID, direction: "up" } },
] as const;

const allServices = [mocks.add, mocks.update, mocks.del, mocks.move];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActor.mockResolvedValue({ id: ACTOR_ID, role: "user" });
  mocks.can.mockReturnValue(true);
  for (const service of allServices) service.mockResolvedValue({ ok: true, customFields: LIST });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe.each(CASES)("$name custom field action", ({ action, service, input }) => {
  it("returns the new list on success, calling the service with the session actor id", async () => {
    expect(await action(input)).toEqual({ ok: true, customFields: LIST });
    expect(service).toHaveBeenCalledTimes(1);
    expect(service.mock.calls[0][0]).toBe(ACTOR_ID);
  });

  it("returns the generic error without touching the service when there is no session", async () => {
    mocks.getActor.mockResolvedValue(null);
    expect(await action(input)).toEqual({ ok: false, error: GENERIC });
    expect(service).not.toHaveBeenCalled();
  });

  it("returns the generic error without touching the service without dashboard:view", async () => {
    mocks.can.mockReturnValue(false);
    expect(await action(input)).toEqual({ ok: false, error: GENERIC });
    expect(mocks.can).toHaveBeenCalledWith("user", "dashboard:view");
    expect(service).not.toHaveBeenCalled();
  });

  it.each([{ userId: "someone-else" }, { user_id: "x" }, { extra: 1 }])(
    "rejects extra keys %j with 'Datos no válidos.' and never calls the service",
    async (extra) => {
      expect(await action({ ...input, ...extra })).toEqual({ ok: false, error: "Datos no válidos." });
      expect(service).not.toHaveBeenCalled();
    },
  );

  it("returns the generic error with no list when the service rejects, logging only the code", async () => {
    service.mockRejectedValue(Object.assign(new Error("secret label Ubicación"), { code: "XX000" }));

    const result = await action(input);

    expect(result).toEqual({ ok: false, error: GENERIC });
    expect(result).not.toHaveProperty("customFields");
    expect(console.error).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("XX000");
    expect(logged).not.toMatch(/secret|Ubicación|Lima/);
  });

  it.each([
    ["limit", "Ya tienes 10 campos personalizados. Elimina uno para añadir otro."],
    ["duplicate_label", "Ya tienes un campo con esa etiqueta."],
    ["not_found", "El campo ya no existe."],
    ["conflict", "No se pudo guardar por un cambio simultáneo. Inténtalo de nuevo."],
  ])("translates reason %s", async (reason, error) => {
    service.mockResolvedValue({ ok: false, reason });
    expect(await action(input)).toEqual({ ok: false, error });
  });
});

describe("input validation", () => {
  it.each(["", "   "])("add and update reject an empty value (%j) with 'Escribe un valor.' without the service", async (value) => {
    expect(await addCustomFieldAction({ label: "Ubicación", value })).toEqual({ ok: false, error: "Escribe un valor." });
    expect(await updateCustomFieldAction({ id: ID, label: "Ubicación", value })).toEqual({
      ok: false,
      error: "Escribe un valor.",
    });
    expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid id and a bad direction without the service", async () => {
    expect(await deleteCustomFieldAction({ id: "nope" })).toEqual({ ok: false, error: "Datos no válidos." });
    expect(await moveCustomFieldAction({ id: ID, direction: "left" })).toEqual({ ok: false, error: "Datos no válidos." });
    expect(mocks.del).not.toHaveBeenCalled();
    expect(mocks.move).not.toHaveBeenCalled();
  });

  it("passes parsed (normalized) data to the service, with delete and move using their own arguments", async () => {
    await addCustomFieldAction({ label: "  Ubicación   exacta ", value: "  Lima " });
    expect(mocks.add).toHaveBeenCalledWith(ACTOR_ID, { label: "Ubicación exacta", value: "Lima" });

    await deleteCustomFieldAction({ id: ID });
    expect(mocks.del).toHaveBeenCalledWith(ACTOR_ID, ID);

    await moveCustomFieldAction({ id: ID, direction: "down" });
    expect(mocks.move).toHaveBeenCalledWith(ACTOR_ID, ID, "down");
  });

  it("IDOR: a foreign field id still goes only with the actor id and surfaces 'El campo ya no existe.'", async () => {
    mocks.move.mockResolvedValue({ ok: false, reason: "not_found" });
    const foreign = "99999999-9999-4999-8999-999999999999";

    expect(await moveCustomFieldAction({ id: foreign, direction: "up" })).toEqual({
      ok: false,
      error: "El campo ya no existe.",
    });
    expect(mocks.move).toHaveBeenCalledWith(ACTOR_ID, foreign, "up");
  });
});
