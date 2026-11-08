"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  parseUiPreferences,
  prefersDark,
  UI_PREFERENCES_KEY,
  type UiPreferences,
} from "../utils/uiPreferences";

const CHANGE_EVENT = "ui-preferences-change";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

export function applyTheme(theme: UiPreferences["theme"]) {
  const dark = prefersDark(theme, window.matchMedia(DARK_QUERY).matches);
  document.documentElement.classList.toggle("dark", dark);
}

function subscribe(onChange: () => void) {
  // Another tab changed the preferences: follow its theme too.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== UI_PREFERENCES_KEY) return;
    applyTheme(parseUiPreferences(event.newValue).theme);
    onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

// The raw string is the snapshot: it is stable between reads, unlike a freshly parsed object.
// Blocked or unavailable storage falls back to the defaults, like the theme script does.
function getSnapshot() {
  try {
    return window.localStorage.getItem(UI_PREFERENCES_KEY);
  } catch {
    return null;
  }
}
const getServerSnapshot = () => null;

// Device-only preferences (D25): theme, density and reduced motion, validated on every read (R27).
export function useUiPreferences() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const preferences = useMemo(() => parseUiPreferences(raw), [raw]);

  const setPreferences = useCallback(
    (changes: Partial<UiPreferences>) => {
      const next = parseUiPreferences({ ...preferences, ...changes });
      applyTheme(next.theme);
      try {
        window.localStorage.setItem(UI_PREFERENCES_KEY, JSON.stringify(next));
      } catch {
        // Not persisted (storage blocked or full); the theme still applies to this page.
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [preferences],
  );

  return { preferences, setPreferences };
}

const noSubscription = () => () => {};
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// Read-only region info (D25). Empty on the server, so SSR and hydration agree.
export function useBrowserTimeZone() {
  return useSyncExternalStore(noSubscription, browserTimeZone, () => "");
}
