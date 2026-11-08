"use client";

import { useEffect } from "react";
import { applyTheme, DARK_QUERY, useUiPreferences } from "@/modules/account";

// Applies device preferences to <html>, not only to the panel container, so menus, sheets and
// tooltips rendered in portals get them too; they are removed when leaving the panel (R26).
export function UiPreferencesRoot({ children }: { children: React.ReactNode }) {
  const { preferences } = useUiPreferences();
  const { theme, density, reduceMotion } = preferences;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.density = density;
    root.dataset.reduceMotion = String(reduceMotion);
    return () => {
      delete root.dataset.density;
      delete root.dataset.reduceMotion;
    };
  }, [density, reduceMotion]);

  // The theme class is set before paint by the inline script and on every change by setPreferences;
  // here we only follow the OS while "Sistema" is chosen, so hydration never re-applies a default.
  useEffect(() => {
    if (theme !== "system") return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = () => applyTheme("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  return children;
}
