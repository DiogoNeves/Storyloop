import { describe, expect, it } from "vitest";

import { filterActivityItems } from "@/lib/activity-search";
import type { ActivityItem } from "@/lib/types/entries";

const items: ActivityItem[] = [
  {
    id: "journal-1",
    title: "Create the AI village",
    summary: "Exploring pixelation and speech bubble overlays.",
    date: "2024-05-12T15:30:00.000Z",
    category: "journal",
  },
  {
    id: "conversation-1",
    title: "Loopie summarized your audience research sprint",
    summary:
      "Loopie connected sentiment shifts across shorts and drafted experiments.",
    date: "2024-05-11T12:00:00.000Z",
    category: "conversation",
  },
  {
    id: "content-1",
    title: "Published the season premiere",
    summary: "Story-focused cold open lifted AVD to 71%.",
    date: "2024-05-10T09:00:00.000Z",
    category: "content",
  },
];

describe("filterActivityItems", () => {
  it("returns all items for an empty query", () => {
    expect(filterActivityItems(items, "")).toEqual(items);
  });

  it("matches fuzzy terms across titles", () => {
    const result = filterActivityItems(items, "audience sprint");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("conversation-1");
  });

  it("matches non-contiguous fuzzy sequences", () => {
    const result = filterActivityItems(items, "ctav");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("journal-1");
  });

  it("does not match summary-only queries", () => {
    const result = filterActivityItems(items, "experiments");
    expect(result).toHaveLength(0);
  });
});
