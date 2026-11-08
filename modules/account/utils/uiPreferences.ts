export const UI_PREFERENCES_KEY = "ui-preferences";

export const THEMES = ["light", "dark", "system"] as const;
export const DENSITIES = ["comfortable", "compact"] as const;

export type Theme = (typeof THEMES)[number];
export type Density = (typeof DENSITIES)[number];

export type UiPreferences = {
  theme: Theme;
  density: Density;
  reduceMotion: boolean;
};

export const THEME_LABELS: Record<Theme, string> = { light: "Claro", dark: "Oscuro", system: "Sistema" };
export const DENSITY_LABELS: Record<Density, string> = { comfortable: "Cómoda", compact: "Compacta" };

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  theme: "system",
  density: "comfortable",
  reduceMotion: false,
};

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  (values as readonly unknown[]).includes(value);

// localStorage is untrusted input: anything unknown falls back to the default, field by field.
export function parseUiPreferences(raw: unknown): UiPreferences {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ...DEFAULT_UI_PREFERENCES };
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ...DEFAULT_UI_PREFERENCES };
  }
  const { theme, density, reduceMotion } = value as Record<string, unknown>;
  return {
    theme: isOneOf(THEMES, theme) ? theme : DEFAULT_UI_PREFERENCES.theme,
    density: isOneOf(DENSITIES, density) ? density : DEFAULT_UI_PREFERENCES.density,
    reduceMotion: typeof reduceMotion === "boolean" ? reduceMotion : DEFAULT_UI_PREFERENCES.reduceMotion,
  };
}

export function prefersDark(theme: Theme, systemDark: boolean): boolean {
  return theme === "dark" || (theme === "system" && systemDark);
}

// Runs in <head> before first paint (D21). Same rules as parseUiPreferences: only "light", "dark" or
// "system", otherwise "system". Static string: no user or server data is interpolated.
export const THEME_INIT_SCRIPT = `(function(){var t="system";try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(
  UI_PREFERENCES_KEY,
)})||"null");if(p&&(p.theme==="light"||p.theme==="dark"))t=p.theme}catch(e){}var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)})();`;
