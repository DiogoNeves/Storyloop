import { describe, expect, it } from "vitest";

import {
  DEFAULT_ACCENT_PREFERENCE,
  DEFAULT_SETTINGS_RESPONSE,
  DEFAULT_SMART_UPDATE_SCHEDULE_HOURS,
  resolveSettingsResponse,
  type SettingsResponse,
} from "@/api/settings";

describe("resolveSettingsResponse", () => {
  it("returns provided settings unchanged", () => {
    const settings: SettingsResponse = {
      smartUpdateScheduleHours: 6,
      showArchived: true,
      activityFeedSortDate: "modified",
      todayEntriesEnabled: false,
      todayIncludePreviousIncomplete: false,
      todayMoveCompletedToEnd: false,
      accentColor: "azure",
    };

    expect(resolveSettingsResponse(settings)).toEqual(settings);
  });

  it("returns default settings when value is undefined", () => {
    expect(resolveSettingsResponse(undefined)).toEqual(DEFAULT_SETTINGS_RESPONSE);
  });

  it("keeps scalar default exports derived from default settings", () => {
    expect(DEFAULT_SMART_UPDATE_SCHEDULE_HOURS).toBe(
      DEFAULT_SETTINGS_RESPONSE.smartUpdateScheduleHours,
    );
    expect(DEFAULT_ACCENT_PREFERENCE).toBe(DEFAULT_SETTINGS_RESPONSE.accentColor);
  });
});
