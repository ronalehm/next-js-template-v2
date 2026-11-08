import { z } from "zod";

// R30 order: phone first, then the optional fields.
export const PROFILE_FIELD_KEYS = ["phone", "jobTitle", "company", "birthday", "website", "note"] as const;

export const profileSchema = z.object({
  phone: z.string().nullable(),
  jobTitle: z.string().nullable(),
  company: z.string().nullable(),
  birthday: z.string().nullable(),
  website: z.string().nullable(),
  note: z.string().nullable(),
});

const MIN_BIRTHDAY = "1900-01-01";

// Local calendar date as YYYY-MM-DD, evaluated on each parse (not at module load).
function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const maxLength = (max: number) => z.string().max(max, `Máximo ${max} caracteres.`);

const FIELD_RULES = {
  phone: maxLength(30).regex(/^[0-9 +().-]+$/, "Usa solo dígitos, espacios y + ( ) - ."),
  jobTitle: maxLength(100),
  company: maxLength(100),
  birthday: z.iso
    .date("Introduce una fecha válida.")
    .refine((value) => value >= MIN_BIRTHDAY, "La fecha no puede ser anterior a 1900.")
    .refine((value) => value <= todayIso(), "La fecha no puede ser futura."),
  website: z.httpUrl("Introduce una URL que empiece por http:// o https://.").max(200, "Máximo 200 caracteres."),
  note: maxLength(500),
} satisfies Record<(typeof PROFILE_FIELD_KEYS)[number], z.ZodType<string, string>>;

// Trim; blank or null means "remove" (null). Otherwise the field rule applies.
const fieldValue = (rule: z.ZodType<string, string>) =>
  z
    .string()
    .nullable()
    .transform((value) => value?.trim() || null)
    .pipe(rule.nullable());

const fieldInput = <K extends (typeof PROFILE_FIELD_KEYS)[number]>(field: K) =>
  z.strictObject({ field: z.literal(field), value: fieldValue(FIELD_RULES[field]) });

// R32: strict { field, value }; unknown fields and extra keys (e.g. a user id) are rejected.
export const profileFieldInputSchema = z.discriminatedUnion("field", [
  fieldInput("phone"),
  fieldInput("jobTitle"),
  fieldInput("company"),
  fieldInput("birthday"),
  fieldInput("website"),
  fieldInput("note"),
]);
