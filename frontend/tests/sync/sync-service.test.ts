import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import { SyncService } from "@/lib/sync/sync-service";
import type { SyncStore, PendingEntry } from "@/lib/sync/types";

// Mock the entries API
vi.mock("@/api/entries", () => ({
  createEntry: vi.fn(),
  entriesQueries: {
    all: () => ({ queryKey: ["entries"] }),
  },
}));

import { createEntry } from "@/api/entries";

describe("SyncService", () => {
  let mockStore: SyncStore;
  let queryClient: QueryClient;
  let syncService: SyncService;
  let onSyncStart: Mock;
  let onSyncComplete: Mock;
  let onSyncError: Mock;

  const createPendingEntry = (
    id: string,
    attempts = 0,
    status: PendingEntry["status"] = "pending",
  ): PendingEntry => ({
    id,
    data: {
      id,
      title: `Entry ${id}`,
      summary: "Test summary",
      date: new Date().toISOString(),
      category: "journal",
    },
    queuedAt: Date.now(),
    attempts,
    status,
  });

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock store
    mockStore = {
      init: vi.fn().mockResolvedValue(undefined),
      addPending: vi.fn().mockResolvedValue(undefined),
      getAllPending: vi.fn().mockResolvedValue([]),
      getPending: vi.fn().mockResolvedValue(undefined),
      updatePending: vi.fn().mockResolvedValue(undefined),
      removePending: vi.fn().mockResolvedValue(undefined),
      getPendingCount: vi.fn().mockResolvedValue(0),
      clearAll: vi.fn().mockResolvedValue(undefined),
    };

    // Create QueryClient
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Create callbacks
    onSyncStart = vi.fn();
    onSyncComplete = vi.fn();
    onSyncError = vi.fn();

    // Create service
    syncService = new SyncService({
      store: mockStore,
      queryClient,
      onSyncStart,
      onSyncComplete,
      onSyncError,
    });
  });

  describe("queueEntry", () => {
    it("should add entry to store", async () => {
      const input = {
        id: "test-1",
        title: "Test",
        summary: "Summary",
        date: new Date().toISOString(),
        category: "journal" as const,
      };

      await syncService.queueEntry(input);

      expect(mockStore.addPending).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "test-1",
          data: input,
          attempts: 0,
          status: "pending",
        }),
      );
    });
  });

  describe("syncAll", () => {
    it("should not sync when offline", async () => {
      // Mock navigator.onLine to return false
      vi.spyOn(syncService, "isOnline").mockReturnValue(false);

      const result = await syncService.syncAll();

      expect(result).toEqual({ success: 0, failed: 0 });
      expect(mockStore.getAllPending).not.toHaveBeenCalled();
    });

    it("should sync pending entries successfully", async () => {
      const entry = createPendingEntry("test-1");
      (mockStore.getAllPending as Mock).mockResolvedValue([entry]);
      (createEntry as Mock).mockResolvedValue({ id: "test-1" });

      const result = await syncService.syncAll();

      expect(result).toEqual({ success: 1, failed: 0 });
      expect(mockStore.updatePending).toHaveBeenCalledWith("test-1", {
        status: "syncing",
      });
      expect(mockStore.removePending).toHaveBeenCalledWith("test-1");
      expect(onSyncStart).toHaveBeenCalled();
      expect(onSyncComplete).toHaveBeenCalledWith({ success: 1, failed: 0 });
    });

    it("should handle API errors and increment attempts", async () => {
      const entry = createPendingEntry("test-1");
      (mockStore.getAllPending as Mock).mockResolvedValue([entry]);
      (createEntry as Mock).mockRejectedValue(new Error("Network error"));

      const result = await syncService.syncAll();

      expect(result).toEqual({ success: 0, failed: 1 });
      expect(mockStore.updatePending).toHaveBeenCalledWith("test-1", {
        status: "failed",
        attempts: 1,
        lastError: "Network error",
      });
      expect(mockStore.removePending).not.toHaveBeenCalled();
    });

    it("should skip entries that exceeded max retries", async () => {
      const entry = createPendingEntry("test-1", 3, "failed");
      (mockStore.getAllPending as Mock).mockResolvedValue([entry]);

      const result = await syncService.syncAll();

      expect(result).toEqual({ success: 0, failed: 1 });
      expect(createEntry).not.toHaveBeenCalled();
    });

    it("should sync multiple entries", async () => {
      const entries = [
        createPendingEntry("test-1"),
        createPendingEntry("test-2"),
        createPendingEntry("test-3"),
      ];
      (mockStore.getAllPending as Mock).mockResolvedValue(entries);
      (createEntry as Mock).mockResolvedValue({ id: "mock" });

      const result = await syncService.syncAll();

      expect(result).toEqual({ success: 3, failed: 0 });
      expect(createEntry).toHaveBeenCalledTimes(3);
    });

    it("should consider null response (duplicate) as success", async () => {
      const entry = createPendingEntry("test-1");
      (mockStore.getAllPending as Mock).mockResolvedValue([entry]);
      (createEntry as Mock).mockResolvedValue(null);

      const result = await syncService.syncAll();

      expect(result).toEqual({ success: 1, failed: 0 });
      expect(mockStore.removePending).toHaveBeenCalledWith("test-1");
    });
  });

  describe("getPendingCount", () => {
    it("should return count from store", async () => {
      (mockStore.getPendingCount as Mock).mockResolvedValue(5);

      const count = await syncService.getPendingCount();

      expect(count).toBe(5);
    });
  });

  describe("getPendingEntries", () => {
    it("should return entries from store", async () => {
      const entries = [createPendingEntry("test-1")];
      (mockStore.getAllPending as Mock).mockResolvedValue(entries);

      const result = await syncService.getPendingEntries();

      expect(result).toEqual(entries);
    });
  });
});
