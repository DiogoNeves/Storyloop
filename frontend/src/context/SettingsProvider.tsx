import { useMemo } from "react";
import useLocalStorageState from "use-local-storage-state";

import {
  SettingsContext,
  type SettingsContextValue,
} from "./SettingsContext";

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
