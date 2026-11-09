import type { z } from "zod";
import type { PROFILE_FIELD_KEYS, profileFieldInputSchema, profileSchema } from "../schemas/profile.schema";

export type Profile = z.infer<typeof profileSchema>;
export type ProfileFieldKey = (typeof PROFILE_FIELD_KEYS)[number];
// What the client sends (untransformed) and what the service receives (parsed).
export type ProfileFieldInput = z.input<typeof profileFieldInputSchema>;
export type ProfileFieldValue = z.output<typeof profileFieldInputSchema>;

export type ProfileActionResult = { ok: true; profile: Profile } | { ok: false; error: string };
