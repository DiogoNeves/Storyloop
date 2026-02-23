import { createQueryKeys } from "@lukemorales/query-key-factory";

import { apiClient } from "@/api/client";

export type ActivityFeedSortDate = "created" | "modified";
export type AccentPreference =
  | "crimson"
  | "rose"
  | "emerald"
  | "azure"
  | "violet";

export interface SettingsResponse {
  smartUpdateScheduleHours: number;
  showArchived: boolean;
  activityFeedSortDate: ActivityFeedSortDate;
  todayEntriesEnabled: boolean;
  todayIncludePreviousIncomplete: boolean;
  todayMoveCompletedToEnd: boolean;
  accentColor: AccentPreference;
}

// Backend settings are the source of truth. This frontend fallback is only for
// transient pre-fetch rendering.
export const DEFAULT_SETTINGS_RESPONSE: SettingsResponse = {
  smartUpdateScheduleHours: 24,
  showArchived: false,
  activityFeedSortDate: "created",
  todayEntriesEnabled: true,
  todayIncludePreviousIncomplete: true,
  todayMoveCompletedToEnd: true,
  accentColor: "crimson",
};

export const DEFAULT_SMART_UPDATE_SCHEDULE_HOURS =
  DEFAULT_SETTINGS_RESPONSE.smartUpdateScheduleHours;
export const DEFAULT_ACCENT_PREFERENCE: AccentPreference =
  DEFAULT_SETTINGS_RESPONSE.accentColor;

export function resolveSettingsResponse(
  settings?: SettingsResponse,
): SettingsResponse {
  return settings ?? DEFAULT_SETTINGS_RESPONSE;
}

export interface UpdateSettingsInput {
  smartUpdateScheduleHours?: number;
  showArchived?: boolean;
  activityFeedSortDate?: ActivityFeedSortDate;
  todayEntriesEnabled?: boolean;
  todayIncludePreviousIncomplete?: boolean;
  todayMoveCompletedToEnd?: boolean;
  accentColor?: AccentPreference;
}

export const settingsQueries = createQueryKeys("settings", {
  all: () => ({
    queryKey: ["settings"],
    queryFn: async (): Promise<SettingsResponse> => {
      const { data } = await apiClient.get<SettingsResponse>("/settings");
      return data;
    },
  }),
});

export async function updateSettings(
  input: UpdateSettingsInput,
): Promise<SettingsResponse> {
  const { data } = await apiClient.put<SettingsResponse>("/settings", input);
  return data;
}
