import { describe, expect, it } from "vitest";

import { buildActivityFeedItemViewModel } from "@/lib/activity-feed-item-view";

describe("activity-feed-item-view", () => {
  it("derives archive copy when item is archived and offline", () => {
    const view = buildActivityFeedItemViewModel({
      item: {
        id: "entry-1",
        title: "Entry",
        summary: "Summary",
        date: "2025-02-01T00:00:00.000Z",
        category: "journal",
        archived: true,
      },
      isOnline: false,
    });

    expect(view.archiveLabel).toBe("Unarchive");
    expect(view.archiveDisabledAriaLabel).toBe(
      "Archived. Unarchive unavailable.",
    );
    expect(view.isArchiveDisabled).toBe(true);
  });

  it("marks empty smart journal summaries as placeholder", () => {
    const view = buildActivityFeedItemViewModel({
      item: {
        id: "entry-2",
        title: "Smart entry",
        summary: "   ",
        date: "2025-02-01T00:00:00.000Z",
        category: "journal",
        promptBody: "include latest metrics",
      },
      isOnline: true,
    });

    expect(view.isSmartSummaryPlaceholder).toBe(true);
    expect(view.summaryText).toContain("Loopie is preparing");
  });
});
