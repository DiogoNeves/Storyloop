import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import useLocalStorageState from "use-local-storage-state";

import {
  resolveSettingsResponse,
  settingsQueries,
  updateSettings,
  type AccentPreference,
  type SettingsResponse,
} from "@/api/settings";
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
  const queryClient = useQueryClient();
  const settingsQueryKey = settingsQueries.all().queryKey;
  const settingsQuery = useQuery(settingsQueries.all());
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
  const [accentUpdateError, setAccentUpdateError] = useState<string | null>(null);
  const [pendingAccentPreference, setPendingAccentPreference] =
    useState<AccentPreference | null>(null);

  const accentMutation = useMutation({
    mutationFn: async (nextAccent: AccentPreference) => {
      return updateSettings({ accentColor: nextAccent });
    },
    onMutate: async (nextAccent) => {
      setAccentUpdateError(null);
      setPendingAccentPreference(nextAccent);
      await queryClient.cancelQueries({ queryKey: settingsQueryKey });
      const previousSettings =
        queryClient.getQueryData<SettingsResponse>(settingsQueryKey);
      if (previousSettings) {
        queryClient.setQueryData<SettingsResponse>(settingsQueryKey, {
          ...previousSettings,
          accentColor: nextAccent,
        });
      }
      return { previousSettings };
    },
    onError: (_error, _nextAccent, context) => {
      if (context?.previousSettings) {
        queryClient.setQueryData(settingsQueryKey, context.previousSettings);
      } else {
        void queryClient.invalidateQueries({ queryKey: settingsQueryKey });
      }
      setPendingAccentPreference(null);
      setAccentUpdateError("We couldn't update the accent color. Try again.");
    },
    onSuccess: (data) => {
      queryClient.setQueryData(settingsQueryKey, data);
      setPendingAccentPreference(null);
      setAccentUpdateError(null);
    },
  });

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
  const accentPreference = useMemo<AccentPreference>(() => {
    return pendingAccentPreference ?? resolveSettingsResponse(settingsQuery.data).accentColor;
  }, [pendingAccentPreference, settingsQuery.data]);

  const setAccentPreference = useCallback(
    (value: AccentPreference) => {
      if (accentMutation.isPending || value === accentPreference) {
        return;
      }
      accentMutation.mutate(value);
    },
    [accentMutation, accentPreference],
  );

  // Apply theme to document
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    root.dataset.accent = accentPreference;
    if (resolvedTheme === "dark") {
      root.classList.add("dark");
      root.style.colorScheme = "dark";
    } else {
      root.classList.remove("dark");
      root.style.colorScheme = "light";
    }
  }, [accentPreference, resolvedTheme]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      publicOnly: Boolean(publicOnly),
      setPublicOnly,
      themePreference: themePreference ?? "system",
      setThemePreference,
      resolvedTheme,
      accentPreference,
      setAccentPreference,
      isAccentUpdating: accentMutation.isPending,
      accentUpdateError,
    }),
    [
      accentMutation.isPending,
      accentPreference,
      accentUpdateError,
      publicOnly,
      resolvedTheme,
      setAccentPreference,
      setPublicOnly,
      setThemePreference,
      themePreference,
    ],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}
