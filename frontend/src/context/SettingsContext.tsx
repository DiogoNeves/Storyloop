import { createContext, useContext, useMemo } from "react";
import useLocalStorageState from "use-local-storage-state";

interface SettingsContextValue {
  publicOnly: boolean;
  setPublicOnly: (value: boolean) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

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

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
