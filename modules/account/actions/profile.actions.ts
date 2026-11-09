"use server";

import { getActor } from "@/lib/auth";
import { can } from "@/lib/roles";
import type { z } from "zod";
import {
  addCustomFieldInputSchema,
  deleteCustomFieldInputSchema,
  moveCustomFieldInputSchema,
  profileFieldInputSchema,
  updateCustomFieldInputSchema,
} from "../schemas/profile.schema";
import {
  addOwnCustomField,
  deleteOwnCustomField,
  moveOwnCustomField,
  setOwnProfileField,
  updateOwnCustomField,
  type CustomFieldsServiceResult,
} from "../services/profile.service";
import type { CustomFieldsActionResult, ProfileActionResult } from "../types/profile.types";

const GENERIC_ERROR = "No se pudo guardar. Inténtalo de nuevo.";

// R33: public entry point. The row is always the session actor's (D31); any id sent by the client
// is rejected by the strict schema and never used.
export async function updateProfileFieldAction(input: unknown): Promise<ProfileActionResult> {
  try {
    const actor = await getActor();

    if (!actor || !can(actor.role, "dashboard:view")) {
      return { ok: false, error: GENERIC_ERROR };
    }

    const parsed = profileFieldInputSchema.safeParse(input);

    if (!parsed.success) {
      const issue = parsed.error.issues.find((item) => item.path[0] === "value");
      return { ok: false, error: issue?.message ?? "Datos no válidos." };
    }

    const profile = await setOwnProfileField(actor.id, parsed.data);
    return { ok: true, profile };
  } catch (error) {
    // Code and message only, never the submitted value (private data, D31).
    const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
    console.error("updateProfileFieldAction failed", { code, message });
    return { ok: false, error: GENERIC_ERROR };
  }
}

// --- Custom fields (UX-1) -------------------------------------------------

const REASON_ERRORS = {
  limit: "Ya tienes 10 campos personalizados. Elimina uno para añadir otro.",
  duplicate_label: "Ya tienes un campo con esa etiqueta.",
  not_found: "El campo ya no existe.",
  conflict: "No se pudo guardar por un cambio simultáneo. Inténtalo de nuevo.",
} as const;

// Shared thin pipeline: actor + permission, strict parse, service by actor.id only, generic error otherwise.
async function runCustomFieldAction<S extends z.ZodType>(
  input: unknown,
  schema: S,
  call: (userId: string, data: z.output<S>) => Promise<CustomFieldsServiceResult>,
): Promise<CustomFieldsActionResult> {
  try {
    const actor = await getActor();

    if (!actor || !can(actor.role, "dashboard:view")) {
      return { ok: false, error: GENERIC_ERROR };
    }

    const parsed = schema.safeParse(input);

    if (!parsed.success) {
      const issue = parsed.error.issues.find((item) => item.path[0] === "label" || item.path[0] === "value");
      return { ok: false, error: issue?.message ?? "Datos no válidos." };
    }

    const result = await call(actor.id, parsed.data);
    return result.ok ? result : { ok: false, error: REASON_ERRORS[result.reason] };
  } catch (error) {
    // Code only: the message may contain the label or value (private data).
    console.error("customFieldAction failed", { code: (error as { code?: unknown } | null)?.code });
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function addCustomFieldAction(input: unknown): Promise<CustomFieldsActionResult> {
  return runCustomFieldAction(input, addCustomFieldInputSchema, addOwnCustomField);
}

export async function updateCustomFieldAction(input: unknown): Promise<CustomFieldsActionResult> {
  return runCustomFieldAction(input, updateCustomFieldInputSchema, updateOwnCustomField);
}

export async function deleteCustomFieldAction(input: unknown): Promise<CustomFieldsActionResult> {
  return runCustomFieldAction(input, deleteCustomFieldInputSchema, (userId, data) =>
    deleteOwnCustomField(userId, data.id),
  );
}

export async function moveCustomFieldAction(input: unknown): Promise<CustomFieldsActionResult> {
  return runCustomFieldAction(input, moveCustomFieldInputSchema, (userId, data) =>
    moveOwnCustomField(userId, data.id, data.direction),
  );
}
