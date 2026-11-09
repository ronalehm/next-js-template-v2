"use server";

import { getActor } from "@/lib/auth";
import { can } from "@/lib/roles";
import { profileFieldInputSchema } from "../schemas/profile.schema";
import { setOwnProfileField } from "../services/profile.service";
import type { ProfileActionResult } from "../types/profile.types";

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
