import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityFeed } from "@/components/ActivityFeed";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ActivityItem } from "@/lib/types/entries";

vi.mock("@/hooks/useEntryEditing", () => ({
  useEntryEditing: () => ({
    editingEntryId: null,
    editingDraft: null,
    editingError: null,
    deletingEntryId: null,
    isUpdating: false,
    isDeleting: () => false,
    isPinning: () => false,
    isArchiving: () => false,
    startEdit: vi.fn(),
    handleEditDraftChange: vi.fn(),
    cancelEdit: vi.fn(),
    submitEdit: vi.fn(),
    deleteEntry: vi.fn(),
    togglePin: vi.fn(),
    toggleArchive: vi.fn(),
  }),
}));

vi.mock("@/hooks/useSync", () => ({
  useSync: () => ({
    isOnline: true,
    isOfflineSyncAvailable: true,
    pendingCount: 0,
    pendingEntries: [],
    pendingEntryUpdates: [],
    isSyncing: false,
    syncNow: vi.fn(),
    queueEntry: vi.fn(),
    queueEntryUpdate: vi.fn(),
    removePendingEntryUpdate: vi.fn(),
    markServerUnreachable: vi.fn(),
    clearSyncError: vi.fn(),
  }),
}));

vi.mock("@/hooks/useDebouncedAutosave", () => ({
  useDebouncedAutosave: () => ({
    status: "idle",
    errorMessage: null,
    reset: vi.fn(),
    isSaving: false,
  }),
}));

function renderFeed(items: ActivityItem[]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter>
          <ActivityFeed
            items={items}
            isLinked={true}
            todayEntriesEnabled={true}
            searchQuery=""
            tagFilters={[]}
          />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("ActivityFeed Today section", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the Today editor by default and hides today card until toggled", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const items: ActivityItem[] = [
      {
        id: `today-${today}`,
        title: "Today",
        summary: "- [ ] Plan intro\n- [ ]",
        date: `${today}T12:00:00.000Z`,
        category: "today",
        pinned: false,
        archived: false,
      },
      {
        id: "journal-1",
        title: "Weekly notes",
        summary: "Captured learnings.",
        date: `${today}T09:00:00.000Z`,
        category: "journal",
        pinned: false,
        archived: false,
      },
    ];

    renderFeed(items);

    expect(screen.getByRole("button", { name: "Hide Today" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Type a task…")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", {
        name: "Today",
      }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Hide Today" }));

    expect(screen.getByRole("button", { name: "Show Today" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Today" })).toBeInTheDocument();
  });
});
