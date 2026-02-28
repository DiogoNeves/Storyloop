import { createQueryKeys } from "@lukemorales/query-key-factory";

import { apiClient } from "@/api/client";

export type ActivityFeedSortDate = "created" | "modified";
export type AccentPreference =
  | "crimson"
  | "rose"
  | "emerald"
  | "azure"
  | "violet";
export const OPENAI_ACTIVE_MODEL = "openai";
export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

export interface SettingsResponse {
  smartUpdateScheduleHours: number;
  showArchived: boolean;
  activityFeedSortDate: ActivityFeedSortDate;
  todayEntriesEnabled: boolean;
  todayIncludePreviousIncomplete: boolean;
  todayMoveCompletedToEnd: boolean;
  accentColor: AccentPreference;
  openaiKeyConfigured: boolean;
  ollamaBaseUrl: string;
  activeModel: string;
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
  openaiKeyConfigured: false,
  ollamaBaseUrl: DEFAULT_OLLAMA_BASE_URL,
  activeModel: OPENAI_ACTIVE_MODEL,
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
  openaiApiKey?: string | null;
  ollamaBaseUrl?: string;
  activeModel?: string;
}

export interface ConnectOllamaInput {
  ollamaBaseUrl: string;
}

export interface ConnectOllamaResponse {
  ollamaBaseUrl: string;
  models: string[];
}

export interface ContentExportResponse {
  fileName: string;
  blob: Blob;
}

const UTF8_FILE_NAME_PATTERN = /filename\*=UTF-8''([^;]+)/i;
const STANDARD_FILE_NAME_PATTERN = /filename="?([^";]+)"?/i;

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

export async function exportContentArchive(): Promise<ContentExportResponse> {
  const response = await apiClient.get<Blob>("/settings/export", {
    responseType: "blob",
  });
  const fileName = parseExportFileName(
    response.headers?.["content-disposition"],
  );
  return {
    fileName,
    blob: response.data,
  };
}

export async function connectOllama(
  input: ConnectOllamaInput,
): Promise<ConnectOllamaResponse> {
  const { data } = await apiClient.post<ConnectOllamaResponse>(
    "/settings/ollama/connect",
    input,
  );
  return data;
}

function parseExportFileName(header: unknown): string {
  const fallback = "storyloop-export.zip";
  if (typeof header !== "string") {
    return fallback;
  }

  const utf8Match = UTF8_FILE_NAME_PATTERN.exec(header);
  if (utf8Match?.[1]) {
    try {
      const candidate = decodeURIComponent(utf8Match[1]).trim();
      return candidate || fallback;
    } catch {
      return fallback;
    }
  }

  const standardMatch = STANDARD_FILE_NAME_PATTERN.exec(header);
  if (standardMatch?.[1]) {
    const candidate = standardMatch[1].trim();
    return candidate || fallback;
  }

  return fallback;
}
