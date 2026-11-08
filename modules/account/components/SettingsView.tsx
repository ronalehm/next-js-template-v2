"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { useBrowserTimeZone, useUiPreferences } from "../hooks/useUiPreferences";
import { DENSITIES, DENSITY_LABELS, THEME_LABELS, THEMES, type Density } from "../utils/uiPreferences";
import { SectionLabel } from "./AccountSummary";

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-11 items-center gap-3 px-4 text-sm">
      <span className="flex-1">{label}</span>
      <span className="text-muted-foreground">{value}</span>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>{title}</SectionLabel>
      <div className="divide-y overflow-hidden rounded-xl bg-card shadow-card">{children}</div>
    </section>
  );
}

// Configuración (screen 09, partial). Device-only preferences in localStorage (D21, D25).
// Editable time zone, date format and e-mail notices are postponed (P-POST-1).
export function SettingsView() {
  const { preferences, setPreferences } = useUiPreferences();
  const timeZone = useBrowserTimeZone();

  return (
    <div className="flex w-full max-w-180 flex-col gap-6">
      <h1 className="text-[32px] leading-[38px] font-bold tracking-[-0.01em]">Configuración</h1>

      <section className="flex flex-col gap-2">
        <SectionLabel>Apariencia</SectionLabel>
        <div role="radiogroup" aria-label="Tema" className="flex flex-wrap gap-4">
          {THEMES.map((theme) => {
            const selected = preferences.theme === theme;
            return (
              <button
                key={theme}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPreferences({ theme })}
                className="group flex flex-col items-center gap-2 rounded-[14px] focus-visible:outline-none"
              >
                <span
                  aria-hidden
                  className={cn(
                    "theme-preview block h-25 w-42 overflow-hidden rounded-[14px] ring-1 ring-border transition-shadow group-focus-visible:ring-2 group-focus-visible:ring-ring group-active:scale-[0.98]",
                    `theme-preview-${theme}`,
                    selected && "ring-[2.5px] ring-primary",
                  )}
                />
                <span className={cn("text-[13px]", selected ? "font-medium" : "text-muted-foreground")}>
                  {THEME_LABELS[theme]}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <Group title="Idioma y región">
        <ReadOnlyRow label="Idioma" value="Español" />
        <ReadOnlyRow label="Zona horaria" value={timeZone || "—"} />
        <ReadOnlyRow label="Formato de fecha" value="dd/mm/aaaa" />
      </Group>

      <Group title="Interfaz">
        <div className="flex h-13 items-center gap-3 px-4 text-sm">
          <span id="density-label" className="flex-1">
            Densidad
          </span>
          <ToggleGroup
            aria-labelledby="density-label"
            value={[preferences.density]}
            onValueChange={(value: string[]) => {
              const density = value[0] as Density | undefined;
              if (density && DENSITIES.includes(density)) setPreferences({ density });
            }}
            spacing={0}
            className="rounded-lg bg-secondary p-0.5"
          >
            {DENSITIES.map((density) => (
              <ToggleGroupItem
                key={density}
                value={density}
                size="sm"
                className="h-7 rounded-md! px-3 text-[13px] data-pressed:bg-segment-active data-pressed:font-medium data-pressed:shadow-control"
              >
                {DENSITY_LABELS[density]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="flex h-11 items-center gap-3 px-4 text-sm">
          <Label htmlFor="reduce-motion" className="flex-1 font-normal">
            Reducir movimiento
          </Label>
          <Switch
            id="reduce-motion"
            checked={preferences.reduceMotion}
            onCheckedChange={(reduceMotion) => setPreferences({ reduceMotion })}
          />
        </div>
      </Group>

      <p className="text-[13px] text-muted-foreground">
        El tema, la densidad y el movimiento se guardan solo en este dispositivo. Tu rol y tus permisos los gestiona
        el panel; tu nombre, tus correos y tu contraseña, tu cuenta.
      </p>
    </div>
  );
}
