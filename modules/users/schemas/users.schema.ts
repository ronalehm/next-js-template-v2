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
