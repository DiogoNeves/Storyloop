import { createContext, useMemo } from "react";
import useLocalStorageState from "use-local-storage-state";

export interface SettingsContextValue {
  publicOnly: boolean;
  setPublicOnly: (value: boolean) => void;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [publicOnly, setPublicOnly] = useLocalStorageState<boolean>(
    "publicOnlyFilter",
    {
      defaultValue: true,
    },
  );

  const value = useMemo<SettingsContextValue>(
    () => ({
      publicOnly: Boolean(publicOnly),
      setPublicOnly,
    }),
    [publicOnly, setPublicOnly],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}
