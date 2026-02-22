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

  it("shows unread dot for smart entries that were never opened", () => {
    const view = buildActivityFeedItemViewModel({
      item: {
        id: "entry-smart-unopened",
        title: "Smart entry",
        summary: "Summary",
        date: "2026-02-15T00:00:00.000Z",
        updatedAt: "2026-02-16T00:00:00.000Z",
        category: "journal",
        promptBody: "include latest metrics",
        lastOpenedAt: null,
      },
      isOnline: true,
    });

    expect(view.showSmartUpdatedSinceLastOpen).toBe(true);
  });

  it("shows unread dot for smart entries updated after last open", () => {
    const view = buildActivityFeedItemViewModel({
      item: {
        id: "entry-smart-updated",
        title: "Smart entry",
        summary: "Summary",
        date: "2026-02-15T00:00:00.000Z",
        updatedAt: "2026-02-16T00:00:00.000Z",
        category: "journal",
        promptBody: "include latest metrics",
        lastOpenedAt: "2026-02-15T23:00:00.000Z",
      },
      isOnline: true,
    });

    expect(view.showSmartUpdatedSinceLastOpen).toBe(true);
  });

  it("hides unread dot for smart entries opened after latest update", () => {
    const view = buildActivityFeedItemViewModel({
      item: {
        id: "entry-smart-opened",
        title: "Smart entry",
        summary: "Summary",
        date: "2026-02-15T00:00:00.000Z",
        updatedAt: "2026-02-16T00:00:00.000Z",
        category: "journal",
        promptBody: "include latest metrics",
        lastOpenedAt: "2026-02-16T01:00:00.000Z",
      },
      isOnline: true,
    });

    expect(view.showSmartUpdatedSinceLastOpen).toBe(false);
  });

  it("never shows unread dot for non-smart entries", () => {
    const view = buildActivityFeedItemViewModel({
      item: {
        id: "entry-basic",
        title: "Basic entry",
        summary: "Summary",
        date: "2026-02-15T00:00:00.000Z",
        updatedAt: "2026-02-16T00:00:00.000Z",
        category: "journal",
      },
      isOnline: true,
    });

    expect(view.showSmartUpdatedSinceLastOpen).toBe(false);
  });

  it("formats today entry titles based on entry day", () => {
    const view = buildActivityFeedItemViewModel({
      item: {
        id: "today-2026-02-15",
        title: "Today",
        summary: "- [ ] Plan",
        date: "2026-02-15T00:00:00.000Z",
        category: "today",
      },
      isOnline: true,
    });

    expect(view.titleText).toMatch(/2026|Feb/i);
  });
});
