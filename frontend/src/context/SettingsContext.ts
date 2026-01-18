import { createContext } from "react";

export type ThemePreference = "light" | "dark" | "system";

export interface SettingsContextValue {
  publicOnly: boolean;
  setPublicOnly: (value: boolean) => void;
  themePreference: ThemePreference;
  setThemePreference: (value: ThemePreference) => void;
  resolvedTheme: "light" | "dark";
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);
