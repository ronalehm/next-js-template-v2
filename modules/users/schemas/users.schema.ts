import { z } from "zod";
import { ROLES } from "@/lib/roles";

export const USER_STATUSES = ["active", "revoked", "invited"] as const;
export const SORT_KEYS = ["name", "-name", "email", "-created"] as const;
// Roles the panel can assign; superadmin never (D4).
export const PANEL_ROLES = ["user", "admin"] as const;

// Largest value Postgres accepts as an integer parameter.
const MAX_PAGE = 2_147_483_647;

// R39: URL parameters. Never fails: each invalid or missing value falls back to its default.
export const usersQuerySchema = z.object({
  q: z
    .string()
    .transform((value) => value.trim().slice(0, 100))
    .catch(""),
  status: z.enum(["all", ...USER_STATUSES]).catch("all"),
  role: z.enum(["all", ...ROLES]).catch("all"),
  sort: z.enum(SORT_KEYS).catch("name"),
  page: z.coerce
    .number()
    .int()
    .min(1)
    .transform((value) => Math.min(value, MAX_PAGE))
    .catch(1),
});

// R42, R47: strict inputs of the server actions. Extra keys are rejected.
export const inviteInputSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email("Introduce un correo válido.").max(254, "Introduce un correo válido.")),
  role: z.enum(PANEL_ROLES, "Elige un rol válido."),
});

export const roleInputSchema = z.strictObject({
  id: z.uuid(),
  role: z.enum(PANEL_ROLES, "Elige un rol válido."),
});

export const idInputSchema = z.strictObject({
  id: z.uuid(),
});

// RN-04, RN-11: id plus the admin identity attestation; the server decides if it is required.
export const recoverInputSchema = z.strictObject({
  id: z.uuid(),
  identityVerified: z.boolean().optional(),
});

// RN-07: id plus the email the UI saw (confirmation typed by the user).
export const deleteUserInputSchema = z.strictObject({
  id: z.uuid(),
  email: inviteInputSchema.shape.email,
});

// SYNC-3 RN-03: minimum payload of a verified Clerk `user.deleted` webhook event.
export const userDeletedSchema = z.object({
  type: z.literal("user.deleted"),
  data: z.object({ id: z.string().regex(/^user_[A-Za-z0-9]{1,64}$/), deleted: z.literal(true) }),
});

// USERS-1: no silent truncation; over 50 is rejected (D-U1-6).
const nameField = z
  .string()
  .refine((v) => !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(v), "Quita los caracteres no válidos.")
  .transform((v) => v.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1, "Este campo es obligatorio.").max(50, "Máximo 50 caracteres."));

export const nameInputSchema = z.strictObject({
  id: z.uuid(),
  firstName: nameField,
  lastName: nameField,
  expectedFirstName: z.string().max(256).nullable(), // value of the row the UI saw
  expectedLastName: z.string().max(256).nullable(),
});

// USERS-1b: full mode (active row) or role-only mode (invited row). Strict: no name keys in role-only.
const roleFields = {
  role: z.enum(PANEL_ROLES, "Elige un rol válido."),
  expectedRole: z.enum(ROLES), // role of the row the UI saw
};
const editFullSchema = z.strictObject({ ...nameInputSchema.shape, ...roleFields });
const editRoleOnlySchema = z.strictObject({ id: z.uuid(), ...roleFields });
export const editUserInputSchema = z.union([editFullSchema, editRoleOnlySchema]);
