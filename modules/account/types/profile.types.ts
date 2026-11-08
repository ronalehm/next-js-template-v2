import type { z } from "zod";
import type { profileFieldInputSchema, profileSchema } from "../schemas/profile.schema";

export type Profile = z.infer<typeof profileSchema>;
export type ProfileFieldKey = keyof Profile;
export type ProfileFieldInput = z.infer<typeof profileFieldInputSchema>;

export type ProfileActionResult = { ok: true; profile: Profile } | { ok: false; error: string };
