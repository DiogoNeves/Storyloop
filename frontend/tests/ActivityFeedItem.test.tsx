import { render, screen } from "@testing-library/react";
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

  render(
    <TooltipProvider>
      <MemoryRouter>
        <ActivityFeedItem item={item} onArchiveToggle={vi.fn()} />
      </MemoryRouter>
    </TooltipProvider>,
  );
}
