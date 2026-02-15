import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityFeedItem } from "@/components/ActivityFeedItem";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ActivityItem } from "@/lib/types/entries";

const syncState = {
  isOnline: true,
  isOfflineSyncAvailable: true,
  pendingCount: 0,
  pendingEntries: [],
  pendingEntryUpdates: [],
  isSyncing: false,
  syncNow: vi.fn().mockResolvedValue(undefined),
  queueEntry: vi.fn().mockResolvedValue(undefined),
  queueEntryUpdate: vi.fn().mockResolvedValue(undefined),
  removePendingEntryUpdate: vi.fn().mockResolvedValue(undefined),
  markServerUnreachable: vi.fn(),
  clearSyncError: vi.fn(),
};

vi.mock("@/hooks/useSync", () => ({
  useSync: () => syncState,
}));

describe("ActivityFeedItem archive control", () => {
  beforeEach(() => {
    syncState.isOnline = true;
  });

  it("shows archive action text and state label when archive is disabled for unarchived entries", () => {
    syncState.isOnline = false;
    renderActivityFeedItem({ archived: false });

    expect(screen.getByText("Archive")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Not archived. Archive unavailable."),
    ).toBeInTheDocument();
  });

  it("shows unarchive action text and state label when archive is disabled for archived entries", () => {
    syncState.isOnline = false;
    renderActivityFeedItem({ archived: true });

    expect(screen.getByText("Unarchive")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Archived. Unarchive unavailable."),
    ).toBeInTheDocument();
  });
});

describe("ActivityFeedItem summary preview", () => {
  it("renders journal markdown formatting instead of raw markdown markers", () => {
    renderActivityFeedItem({
      summary: "Use **bold** with `code`",
      category: "journal",
    });

    const preview = screen.getByTestId("activity-preview-body");
    expect(preview.querySelector("strong")).not.toBeNull();
    expect(preview.querySelector("code")).not.toBeNull();
    expect(within(preview).queryByText("**bold**")).not.toBeInTheDocument();
  });

  it("renders conversation markdown formatting", () => {
    renderActivityFeedItem({
      summary: "1. First item\n2. **Second item**",
      category: "conversation",
    });

    const preview = screen.getByTestId("activity-preview-body");
    expect(preview.querySelector("strong")).not.toBeNull();
  });

  it("keeps content summaries as plain text for performance", () => {
    renderActivityFeedItem({
      summary: "Use **bold** but keep raw markers",
      category: "content",
    });

    const preview = screen.getByTestId("activity-preview-body");
    expect(preview.querySelector("strong")).toBeNull();
    expect(within(preview).getByText("Use **bold** but keep raw markers"));
  });

  it("applies a three-line clamp to the preview body", () => {
    renderActivityFeedItem({
      summary:
        "Paragraph one.\n\nParagraph two with **markdown**.\n\nParagraph three.",
      category: "journal",
    });

    const preview = screen.getByTestId("activity-preview-body");
    expect(preview.querySelector(".line-clamp-3")).not.toBeNull();
  });

  it("renders markdown links as non-clickable text", () => {
    renderActivityFeedItem({
      summary: "[Open docs](https://example.com)",
      category: "journal",
    });

    const preview = screen.getByTestId("activity-preview-body");
    expect(preview.querySelectorAll("a")).toHaveLength(0);
    expect(within(preview).getByText("Open docs")).toBeInTheDocument();
  });

  it("shows the smart-summary placeholder pulse for empty smart journals", () => {
    renderActivityFeedItem({
      summary: "   ",
      category: "journal",
      promptBody: "Summarize my week",
    });

    const preview = screen.getByTestId("activity-preview-body");
    expect(preview.querySelector(".animate-ping")).not.toBeNull();
  });
});

function renderActivityFeedItem(overrides: Partial<ActivityItem>) {
  const item: ActivityItem = {
    id: "journal-1",
    title: "Weekly reflection",
    summary: "Summary",
    date: "2025-01-01T00:00:00.000Z",
    category: "journal",
    pinned: false,
    archived: false,
    ...overrides,
  };

  return render(
    <TooltipProvider>
      <MemoryRouter>
        <ActivityFeedItem item={item} onArchiveToggle={vi.fn()} />
      </MemoryRouter>
    </TooltipProvider>,
  );
}
