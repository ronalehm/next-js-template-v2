import type { ProfileFieldKey } from "../types/profile.types";

export const PROFILE_FIELD_LABELS: Record<ProfileFieldKey, string> = {
  phone: "Teléfono",
  jobTitle: "Cargo",
  company: "Empresa",
  birthday: "Cumpleaños",
  website: "Sitio web",
  note: "Nota personal",
};

// R30: optional rows after Teléfono, in this order.
export const OPTIONAL_PROFILE_FIELDS: readonly ProfileFieldKey[] = ["jobTitle", "company", "birthday", "website", "note"];

const longDate = new Intl.DateTimeFormat("es", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// birthday is an ISO date (YYYY-MM-DD): shown as "12 de marzo de 1990". Everything else as is.
export function formatProfileValue(key: ProfileFieldKey, value: string): string {
  return key === "birthday" ? longDate.format(new Date(`${value}T00:00:00Z`)) : value;
}
