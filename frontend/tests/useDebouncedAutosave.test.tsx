import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDebouncedAutosave } from "@/hooks/useDebouncedAutosave";
import type { Entry } from "@/lib/types/entries";

const updateEntryMock = vi.fn<(input: unknown) => Promise<Entry>>();

const syncState = {
  isOnline: true,
  isOfflineSyncAvailable: true,
  pendingCount: 0,
  pendingEntries: [],
  pendingEntryUpdates: [],
  isSyncing: false,
  lastSyncResult: undefined,
  lastSyncError: undefined,
  syncNow: vi.fn(),
  queueEntry: vi.fn(),
  queueEntryUpdate: vi.fn(() => Promise.resolve()),
  removePendingEntryUpdate: vi.fn(() => Promise.resolve()),
  markServerUnreachable: vi.fn(),
  clearSyncError: vi.fn(),
};

vi.mock("@/hooks/useSync", () => ({
  useSync: () => syncState,
}));

vi.mock("@/api/entries", () => ({
  updateEntry: (input: unknown) => updateEntryMock(input),
  entriesQueries: {
    all: () => ({
      queryKey: ["entries"],
    }),
    byId: (id: string) => ({
      queryKey: ["entries", id],
    }),
  },
}));

interface WrapperProps {
  children: ReactNode;
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: WrapperProps) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function buildSavedEntry(id: string, summary: string): Entry {
  const now = new Date().toISOString();
  return {
    id,
    title: "Today",
    summary,
    date: now,
    updatedAt: now,
    category: "today",
    pinned: false,
    archived: false,
    tags: [],
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function sleep(ms: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("useDebouncedAutosave", () => {
  afterEach(() => {
    syncState.isOnline = true;
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("saves directly without queueing when online", async () => {
    updateEntryMock.mockResolvedValue(buildSavedEntry("today-1", "- [ ] Updated"));

    const { rerender } = renderHook(
      ({ summary }) =>
        useDebouncedAutosave({
          entryId: "today-1",
          title: "Today",
          summary,
          enabled: true,
          debounceMs: 1,
        }),
      {
        initialProps: { summary: "- [ ] Original" },
        wrapper: createWrapper(),
      },
    );

    rerender({ summary: "- [ ] Updated" });

    await waitFor(() => {
      expect(updateEntryMock).toHaveBeenCalledTimes(1);
    });

    expect(syncState.queueEntryUpdate).not.toHaveBeenCalled();
    expect(syncState.removePendingEntryUpdate).toHaveBeenCalledWith("today-1");
  });

  it("queues changes immediately when offline", async () => {
    syncState.isOnline = false;
    updateEntryMock.mockResolvedValue(buildSavedEntry("today-1", "- [ ] Updated"));

    const { rerender } = renderHook(
      ({ summary }) =>
        useDebouncedAutosave({
          entryId: "today-1",
          title: "Today",
          summary,
          enabled: true,
          debounceMs: 1,
        }),
      {
        initialProps: { summary: "- [ ] Original" },
        wrapper: createWrapper(),
      },
    );

    rerender({ summary: "- [ ] Updated" });

    await waitFor(() => {
      expect(syncState.queueEntryUpdate).toHaveBeenCalledTimes(1);
    });

    expect(updateEntryMock).not.toHaveBeenCalled();
    expect(syncState.removePendingEntryUpdate).not.toHaveBeenCalled();
  });

  it("queues and marks server unreachable on network errors", async () => {
    updateEntryMock.mockRejectedValue(new Error("Network Error"));

    const { rerender } = renderHook(
      ({ summary }) =>
        useDebouncedAutosave({
          entryId: "today-1",
          title: "Today",
          summary,
          enabled: true,
          debounceMs: 1,
        }),
      {
        initialProps: { summary: "- [ ] Original" },
        wrapper: createWrapper(),
      },
    );

    rerender({ summary: "- [ ] Updated" });

    await waitFor(() => {
      expect(updateEntryMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(syncState.queueEntryUpdate).toHaveBeenCalledTimes(1);
    });

    expect(syncState.markServerUnreachable).toHaveBeenCalledTimes(1);
    expect(syncState.removePendingEntryUpdate).not.toHaveBeenCalled();
  });

  it("does not issue duplicate saves while the first save is in-flight", async () => {
    const deferredSave = createDeferred<Entry>();
    updateEntryMock.mockReturnValue(deferredSave.promise);

    const { rerender } = renderHook(
      ({ summary }) =>
        useDebouncedAutosave({
          entryId: "today-1",
          title: "Today",
          summary,
          enabled: true,
          debounceMs: 10,
        }),
      {
        initialProps: { summary: "- [ ] Original" },
        wrapper: createWrapper(),
      },
    );

    rerender({ summary: "- [ ] Updated" });
    await act(async () => {
      await sleep(40);
    });
    expect(updateEntryMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await sleep(180);
    });
    expect(updateEntryMock).toHaveBeenCalledTimes(1);

    act(() => {
      deferredSave.resolve(buildSavedEntry("today-1", "- [ ] Updated"));
    });
    await waitFor(() => {
      expect(syncState.removePendingEntryUpdate).toHaveBeenCalledWith("today-1");
    });
  });

  it("surfaces an autosave error when offline queueing fails", async () => {
    syncState.isOnline = false;
    syncState.queueEntryUpdate.mockRejectedValueOnce(
      new Error("IndexedDB unavailable"),
    );

    const { result, rerender } = renderHook(
      ({ summary }) =>
        useDebouncedAutosave({
          entryId: "today-1",
          title: "Today",
          summary,
          enabled: true,
          debounceMs: 1,
        }),
      {
        initialProps: { summary: "- [ ] Original" },
        wrapper: createWrapper(),
      },
    );

    rerender({ summary: "- [ ] Updated" });

    await waitFor(() => {
      expect(syncState.queueEntryUpdate).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.errorMessage).toBe("IndexedDB unavailable");
    expect(updateEntryMock).not.toHaveBeenCalled();
  });
});
