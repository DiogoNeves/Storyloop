import { describe, expect, it } from "vitest";

import type { ActivityDraft } from "@/components/ActivityFeed";
import type { ActivityItem } from "@/lib/types/entries";
import {
  buildJournalEntryInput,
  buildOptimisticJournalEntry,
  isLikelyNetworkError,
  shouldClearActiveTag,
} from "@/lib/journal-page-logic";

describe("journal-page-logic", () => {
  it("builds a trimmed journal entry input from draft", () => {
    const draft: ActivityDraft = {
      title: "  Weekly review  ",
      summary: "",
      date: "2025-02-01T10:30",
      mode: "smart",
      promptBody: "  mention retention  ",
      promptFormat: "   ",
    };

    const input = buildJournalEntryInput(draft, "entry-1");

    expect(input).toMatchObject({
      id: "entry-1",
      title: "Weekly review",
      category: "journal",
      promptBody: "mention retention",
      promptFormat: null,
    });
  });

  it("creates optimistic entry defaults", () => {
    const optimistic = buildOptimisticJournalEntry(
      {
        id: "entry-2",
        title: "Retention lift",
        summary: "",
        date: "2025-02-01T10:30:00.000Z",
        category: "journal",
        promptBody: "Track #retention",
      },
      "2025-02-02T00:00:00.000Z",
    );

    expect(optimistic.archived).toBe(false);
    expect(optimistic.videoId).toBeNull();
    expect(optimistic.tags).toContain("retention");
  });

  it("detects likely network errors", () => {
    expect(isLikelyNetworkError(new Error("Network Error"))).toBe(true);
    expect(isLikelyNetworkError(new Error("Failed to fetch"))).toBe(true);
    expect(isLikelyNetworkError(new Error("validation failed"))).toBe(false);
  });

  it("checks whether active tag should be cleared", () => {
    const items: ActivityItem[] = [
      {
        id: "1",
        title: "A",
        summary: "",
        date: "2025-01-01T00:00:00.000Z",
        category: "journal",
        tags: ["strategy"],
      },
    ];

    expect(shouldClearActiveTag("strategy", items)).toBe(false);
    expect(shouldClearActiveTag("retention", items)).toBe(true);
  });
});
