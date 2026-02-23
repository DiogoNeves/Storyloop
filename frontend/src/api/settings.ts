import { createQueryKeys } from "@lukemorales/query-key-factory";

import { apiClient } from "@/api/client";

export const DEFAULT_SMART_UPDATE_SCHEDULE_HOURS = 24;

export type ActivityFeedSortDate = "created" | "modified";
export type AccentPreference =
  | "crimson"
  | "rose"
  | "emerald"
  | "azure"
  | "violet";
export const DEFAULT_ACCENT_PREFERENCE: AccentPreference = "crimson";

export interface SettingsResponse {
  smartUpdateScheduleHours: number;
  showArchived: boolean;
  activityFeedSortDate: ActivityFeedSortDate;
  todayEntriesEnabled: boolean;
  todayIncludePreviousIncomplete: boolean;
  todayMoveCompletedToEnd: boolean;
  accentColor: AccentPreference;
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
