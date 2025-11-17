import { createContext } from "react";

export interface SettingsContextValue {
  publicOnly: boolean;
  setPublicOnly: (value: boolean) => void;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);
