import type { z } from "zod";
import type {
  addCustomFieldInputSchema,
  customFieldSchema,
  moveCustomFieldInputSchema,
  PROFILE_FIELD_KEYS,
  profileFieldInputSchema,
  profileSchema,
  updateCustomFieldInputSchema,
} from "../schemas/profile.schema";

export type Profile = z.infer<typeof profileSchema>;
export type ProfileFieldKey = (typeof PROFILE_FIELD_KEYS)[number];
// What the client sends (untransformed) and what the service receives (parsed).
export type ProfileFieldInput = z.input<typeof profileFieldInputSchema>;
export type ProfileFieldValue = z.output<typeof profileFieldInputSchema>;

export type ProfileActionResult = { ok: true; profile: Profile } | { ok: false; error: string };

// The array order is the position order.
export type CustomField = z.infer<typeof customFieldSchema>;
export type CustomFieldsActionResult = { ok: true; customFields: CustomField[] } | { ok: false; error: string };

// Client sends raw input; the service receives the parsed output.
export type AddCustomFieldInput = z.input<typeof addCustomFieldInputSchema>;
export type AddCustomFieldValue = z.output<typeof addCustomFieldInputSchema>;
export type UpdateCustomFieldInput = z.input<typeof updateCustomFieldInputSchema>;
export type UpdateCustomFieldValue = z.output<typeof updateCustomFieldInputSchema>;
export type CustomFieldDirection = z.infer<typeof moveCustomFieldInputSchema>["direction"];
