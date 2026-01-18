import { useEffect, useMemo, useState } from "react";
import useLocalStorageState from "use-local-storage-state";

import {
  SettingsContext,
  type SettingsContextValue,
  type ThemePreference,
} from "./SettingsContext";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveTheme(
  preference: ThemePreference,
  systemTheme: "light" | "dark",
): "light" | "dark" {
  if (preference === "system") {
    return systemTheme;
  }
  return preference;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [publicOnly, setPublicOnly] = useLocalStorageState<boolean>(
    "publicOnlyFilter",
    {
      defaultValue: true,
    },
  );

  const [themePreference, setThemePreference] =
    useLocalStorageState<ThemePreference>("themePreference", {
      defaultValue: "system",
    });

  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() =>
    getSystemTheme(),
  );

  // Watch for system theme changes
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    // Fallback for older browsers
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  // Compute resolved theme
  const resolvedTheme = useMemo<"light" | "dark">(() => {
    return resolveTheme(themePreference ?? "system", systemTheme);
  }, [themePreference, systemTheme]);

  // Apply theme to document
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    if (resolvedTheme === "dark") {
      root.classList.add("dark");
      root.style.colorScheme = "dark";
    } else {
      root.classList.remove("dark");
      root.style.colorScheme = "light";
    }
  }, [resolvedTheme]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      publicOnly: Boolean(publicOnly),
      setPublicOnly,
      themePreference: themePreference ?? "system",
      setThemePreference,
      resolvedTheme,
    }),
    [publicOnly, setPublicOnly, themePreference, setThemePreference, resolvedTheme],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}
