import { createContext } from "react";

import type { AccentPreference } from "@/api/settings";

export type ThemePreference = "light" | "dark" | "system";

export interface SettingsContextValue {
  publicOnly: boolean;
  setPublicOnly: (value: boolean) => void;
  themePreference: ThemePreference;
  setThemePreference: (value: ThemePreference) => void;
  resolvedTheme: "light" | "dark";
  accentPreference: AccentPreference;
  setAccentPreference: (value: AccentPreference) => void;
  isAccentUpdating: boolean;
  accentUpdateError: string | null;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);
