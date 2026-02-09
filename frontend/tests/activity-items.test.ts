import { describe, expect, it } from "vitest";

import { buildActivityItems } from "@/lib/activity-items";
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
    });
    expect(hidden.map((item) => item.id)).toEqual(["entry-active"]);

    const shown = buildActivityItems({
      entries,
      conversations: [],
      youtubeFeed: null,
      contentTypeFilter: "all",
      publicOnly: false,
      showArchived: true,
    });
    expect(shown.map((item) => item.id)).toEqual([
      "entry-archived",
      "entry-active",
    ]);
  });
});
