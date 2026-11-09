// D1: fixed country list, Peru first and default. Used by the schema and the UI (no server-only).
export const PHONE_COUNTRIES = [
  { code: "PE", dialCode: "51" },
  { code: "AR", dialCode: "54" },
  { code: "BO", dialCode: "591" },
  { code: "BR", dialCode: "55" },
  { code: "CL", dialCode: "56" },
  { code: "CO", dialCode: "57" },
  { code: "EC", dialCode: "593" },
  { code: "MX", dialCode: "52" },
  { code: "ES", dialCode: "34" },
  { code: "US", dialCode: "1" },
] as const;

export type PhoneCountry = (typeof PHONE_COUNTRIES)[number]["code"];

export const DEFAULT_PHONE_COUNTRY: PhoneCountry = "PE";

export const PHONE_TYPES = ["personal", "work", "home"] as const;

export type PhoneType = (typeof PHONE_TYPES)[number];

export const PHONE_TYPE_LABELS: Record<PhoneType, string> = {
  personal: "Personal",
  work: "Trabajo",
  home: "Casa",
};

const E164 = /^\+[1-9]\d{6,14}$/;
const PERU_MOBILE = /^\+519\d{8}$/;
const SEPARATORS = /[\s().-]/g;

const regionNames = new Intl.DisplayNames(["es"], { type: "region" });

const dialCodeOf = (country: PhoneCountry) => PHONE_COUNTRIES.find((item) => item.code === country)!.dialCode;

export function phoneCountryLabel(country: PhoneCountry): string {
  return `${regionNames.of(country)} (+${dialCodeOf(country)})`;
}

// R1: the national number may only contain digits and separators; the prefix comes from the country.
export function toE164(country: PhoneCountry, national: string): string | null {
  const digits = national.trim().replace(SEPARATORS, "");
  if (!/^\d+$/.test(digits)) return null;
  const phone = `+${dialCodeOf(country)}${digits}`;
  return E164.test(phone) ? phone : null;
}

// R2: no D1 prefix is a prefix of another, so at most one matches.
export function splitPhone(stored: string): { country: PhoneCountry; national: string } {
  const compact = stored.replace(SEPARATORS, "");
  const match = compact.startsWith("+")
    ? PHONE_COUNTRIES.find((item) => compact.startsWith(`+${item.dialCode}`))
    : undefined;

  return match
    ? { country: match.code, national: compact.slice(match.dialCode.length + 1) }
    : { country: DEFAULT_PHONE_COUNTRY, national: stored };
}

// R2: Peruvian mobiles grouped 3-3-3; anything else (other E.164 or legacy free text) as stored.
export function formatPhone(stored: string): string {
  return PERU_MOBILE.test(stored) ? stored.slice(3).replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3") : stored;
}
