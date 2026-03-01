import { describe, expect, it } from "vitest";

import { buildActivityItems } from "@/lib/activity-items";
import { getUtcDayKey } from "@/lib/today-entry";
import type { Entry } from "@/lib/types/entries";

function createEntry(index: number): Entry {
  const day = String((index % 28) + 1).padStart(2, "0");
  return {
    id: `entry-${index}`,
    title: `Entry ${index}`,
    summary: "Summary",
    date: `2025-01-${day}T00:00:00.000Z`,
    updatedAt: `2025-01-${day}T00:00:00.000Z`,
    category: "journal",
    pinned: false,
    archived: false,
    tags: [],
  };
}

describe("buildActivityItems", () => {
  it("returns all stored entries without truncating at 50", () => {
    const entries = Array.from({ length: 75 }, (_, index) => createEntry(index));
    const items = buildActivityItems({
      entries,
      conversations: [],
      youtubeFeed: null,
      contentTypeFilter: "all",
      publicOnly: false,
      showArchived: false,
      activityFeedSortDate: "created",
    });

    expect(items).toHaveLength(75);
  });

  it("hides archived journals unless showArchived is enabled", () => {
    const entries: Entry[] = [
      {
        ...createEntry(1),
        id: "entry-active",
        archived: false,
      },
      {
        ...createEntry(2),
        id: "entry-archived",
        archived: true,
      },
    ];

    const hidden = buildActivityItems({
      entries,
      conversations: [],
      youtubeFeed: null,
      contentTypeFilter: "all",
      publicOnly: false,
      showArchived: false,
      activityFeedSortDate: "created",
    });
    expect(hidden.map((item) => item.id)).toEqual(["entry-active"]);

    const shown = buildActivityItems({
      entries,
      conversations: [],
      youtubeFeed: null,
      contentTypeFilter: "all",
      publicOnly: false,
      showArchived: true,
      activityFeedSortDate: "created",
    });
    expect(shown.map((item) => item.id)).toEqual([
      "entry-archived",
      "entry-active",
    ]);
  });

  it("sorts stored entries by created date by default", () => {
    const entries: Entry[] = [
      {
        ...createEntry(1),
        id: "entry-created-first",
        date: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-05T00:00:00.000Z",
      },
      {
        ...createEntry(2),
        id: "entry-created-second",
        date: "2025-01-03T00:00:00.000Z",
        updatedAt: "2025-01-04T00:00:00.000Z",
      },
    ];

    const items = buildActivityItems({
      entries,
      conversations: [],
      youtubeFeed: null,
      contentTypeFilter: "all",
      publicOnly: false,
      showArchived: true,
      activityFeedSortDate: "created",
    });

    expect(items.map((item) => item.id)).toEqual([
      "entry-created-second",
      "entry-created-first",
    ]);
    expect(items[0]?.date).toBe("2025-01-03T00:00:00.000Z");
  });

  it("switches stored entries to modified-date sorting when configured", () => {
    const entries: Entry[] = [
      {
        ...createEntry(1),
        id: "entry-modified-first",
        date: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-05T00:00:00.000Z",
      },
      {
        ...createEntry(2),
        id: "entry-modified-second",
        date: "2025-01-03T00:00:00.000Z",
        updatedAt: "2025-01-04T00:00:00.000Z",
      },
    ];

    const items = buildActivityItems({
      entries,
      conversations: [],
      youtubeFeed: null,
      contentTypeFilter: "all",
      publicOnly: false,
      showArchived: true,
      activityFeedSortDate: "modified",
    });

    expect(items.map((item) => item.id)).toEqual([
      "entry-modified-first",
      "entry-modified-second",
    ]);
    expect(items[0]?.date).toBe("2025-01-05T00:00:00.000Z");
  });

  it("excludes empty past today entries but keeps non-empty and current-day ones", () => {
    const now = new Date("2026-02-16T10:00:00.000Z");
    const todayKey = getUtcDayKey(now);
    const entries: Entry[] = [
      {
        id: `today-2026-02-14`,
        title: "Today",
        summary: "- [ ]",
        date: "2026-02-14T00:00:00.000Z",
        updatedAt: "2026-02-14T00:00:00.000Z",
        category: "today",
        pinned: false,
        archived: false,
        tags: [],
      },
      {
        id: `today-2026-02-15`,
        title: "Today",
        summary: "- [x] Done\n- [ ]",
        date: "2026-02-15T00:00:00.000Z",
        updatedAt: "2026-02-15T00:00:00.000Z",
        category: "today",
        pinned: false,
        archived: false,
        tags: [],
      },
      {
        id: `today-${todayKey}`,
        title: "Today",
        summary: "- [ ]",
        date: `${todayKey}T00:00:00.000Z`,
        updatedAt: `${todayKey}T00:00:00.000Z`,
        category: "today",
        pinned: false,
        archived: false,
        tags: [],
      },
    ];

    const items = buildActivityItems({
      entries,
      conversations: [],
      youtubeFeed: null,
      contentTypeFilter: "all",
      publicOnly: false,
      showArchived: false,
      activityFeedSortDate: "created",
      now: now.getTime(),
    });

    const ids = items.map((item) => item.id);
    expect(ids).toContain(`today-${todayKey}`);
    expect(ids).toContain("today-2026-02-15");
    expect(ids).not.toContain("today-2026-02-14");
  });
});
