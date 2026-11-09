import { z } from "zod";
import { PHONE_COUNTRIES, PHONE_TYPES, toE164 } from "../utils/phone";
import { PROFILE_FIELD_LABELS } from "../utils/profileFields";

// R30 order: phone first, then the optional fields.
export const PROFILE_FIELD_KEYS = ["phone", "jobTitle", "company", "birthday", "website", "note"] as const;

export const profileSchema = z.object({
  phone: z.string().nullable(),
  phoneType: z.enum(PHONE_TYPES).nullable(),
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

// R4: a scheme is "<letter>[letters, digits, + . -]*:" not followed by a port ("example.com:8080").
const HAS_SCHEME = /^[a-z][a-z\d+.-]*:(?!\d+(?:[/?#]|$))/i;

const withScheme = (value: string) =>
  value.startsWith("//") ? `https:${value}` : HAS_SCHEME.test(value) ? value : `https://${value}`;

const FIELD_RULES = {
  jobTitle: maxLength(100),
  company: maxLength(100),
  birthday: z.iso
    .date("Introduce una fecha válida.")
    .refine((value) => value >= MIN_BIRTHDAY, "La fecha no puede ser anterior a 1900.")
    .refine((value) => value <= todayIso(), "La fecha no puede ser futura."),
  website: z
    .string()
    .transform(withScheme)
    .pipe(z.httpUrl("Introduce una URL que empiece por http:// o https://.").max(200, "Máximo 200 caracteres.")),
  note: maxLength(500),
} satisfies Record<Exclude<(typeof PROFILE_FIELD_KEYS)[number], "phone">, z.ZodType<string, string>>;

// Trim; blank or null means "remove" (null). Otherwise the field rule applies.
const fieldValue = (rule: z.ZodType<string, string>) =>
  z
    .string()
    .nullable()
    .transform((value) => value?.trim() || null)
    .pipe(rule.nullable());

const fieldInput = <K extends keyof typeof FIELD_RULES>(field: K) =>
  z.strictObject({ field: z.literal(field), value: fieldValue(FIELD_RULES[field]) });

// R3: { country, national, type } in, { phone: E.164, type } out; a blank number means "remove" (null).
const phoneValue = z
  .strictObject({
    country: z.enum(PHONE_COUNTRIES.map((item) => item.code)),
    national: z
      .string()
      .trim()
      .regex(/^[\d\s().-]*$/, "Usa solo dígitos, espacios y ( ) - ."),
    type: z.enum(PHONE_TYPES),
  })
  .transform(({ country, national, type }, ctx) => {
    if (!national) return null;
    const phone = toE164(country, national);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "Número no válido.", path: ["national"] });
      return z.NEVER;
    }
    return { phone, type };
  })
  .nullable();

// R32: strict { field, value }; unknown fields and extra keys (e.g. a user id) are rejected.
export const profileFieldInputSchema = z.discriminatedUnion("field", [
  z.strictObject({ field: z.literal("phone"), value: phoneValue }),
  fieldInput("jobTitle"),
  fieldInput("company"),
  fieldInput("birthday"),
  fieldInput("website"),
  fieldInput("note"),
]);

// ---- Custom fields (SPEC-account-profile-custom-fields) ----

export const MAX_CUSTOM_FIELDS = 10;

// Control chars (\n, \r, tab...) and Unicode line/paragraph separators: single-line text only.
const MULTILINE_OR_CONTROL = /[\p{Cc}\p{Zl}\p{Zp}]/u;

// Single source for the stored label: trim, collapse inner whitespace, NFC.
export const normalizeCustomLabel = (raw: string): string => raw.trim().replace(/\s+/g, " ").normalize("NFC");

// Duplicate key within a user's fields (case-insensitive, accents kept). Expects a normalized label.
export const customLabelKey = (label: string): string => label.toLowerCase();

// Reserved key: case- and accent-insensitive.
const reservedKey = (label: string): string => label.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export const RESERVED_LABELS: readonly string[] = [...Object.values(PROFILE_FIELD_LABELS), "Nombre", "Apellido", "Correo"];

const RESERVED_KEYS = new Set(RESERVED_LABELS.map(reservedKey));

const customLabel = z
  .string()
  .transform((raw, ctx) => {
    if (MULTILINE_OR_CONTROL.test(raw)) {
      ctx.addIssue({ code: "custom", message: "La etiqueta debe ser de una sola línea." });
      return z.NEVER;
    }
    return normalizeCustomLabel(raw);
  })
  .pipe(
    z
      .string()
      .min(1, "Escribe una etiqueta.")
      .max(40, "Máximo 40 caracteres.")
      .refine((label) => !RESERVED_KEYS.has(reservedKey(label)), "Esa etiqueta ya existe en tu perfil. Usa otra."),
  );

// Control check runs on the raw input (so "a\n" is not saved by trim), then trim, empty, length.
const customValue = z
  .string()
  .transform((raw, ctx) => {
    if (MULTILINE_OR_CONTROL.test(raw)) {
      ctx.addIssue({ code: "custom", message: "El valor debe ser de una sola línea." });
      return z.NEVER;
    }
    return raw.trim();
  })
  .pipe(z.string().min(1, "Escribe un valor.").max(200, "Máximo 200 caracteres."));

export const customFieldSchema = z.object({ id: z.uuid(), label: z.string(), value: z.string() });
export const addCustomFieldInputSchema = z.strictObject({ label: customLabel, value: customValue });
export const updateCustomFieldInputSchema = z.strictObject({ id: z.uuid(), label: customLabel, value: customValue });
export const deleteCustomFieldInputSchema = z.strictObject({ id: z.uuid() });
export const moveCustomFieldInputSchema = z.strictObject({ id: z.uuid(), direction: z.enum(["up", "down"]) });
