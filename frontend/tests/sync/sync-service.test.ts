import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import { SyncService } from "@/lib/sync/sync-service";
import type { SyncStore, PendingEntry } from "@/lib/sync/types";

// Mock the entries API
vi.mock("@/api/entries", () => ({
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  entriesQueries: {
    all: () => ({ queryKey: ["entries"] }),
  },
}));

import { createEntry, updateEntry } from "@/api/entries";

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
      addPendingUpdate: vi.fn().mockResolvedValue(undefined),
      getAllPendingUpdates: vi.fn().mockResolvedValue([]),
      getPendingUpdate: vi.fn().mockResolvedValue(undefined),
      updatePendingUpdate: vi.fn().mockResolvedValue(undefined),
      removePendingUpdate: vi.fn().mockResolvedValue(undefined),
      getPendingUpdateCount: vi.fn().mockResolvedValue(0),
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

      expect(result).toEqual({ success: 0, failed: 0, skippedMaxRetries: 0, abortedOffline: 0 });
      expect(mockStore.getAllPending).not.toHaveBeenCalled();
    });

    it("should sync pending entries successfully", async () => {
      const entry = createPendingEntry("test-1");
      (mockStore.getAllPending as Mock).mockResolvedValue([entry]);
      (createEntry as Mock).mockResolvedValue({ id: "test-1" });

      const result = await syncService.syncAll();

      expect(result).toEqual({ success: 1, failed: 0, skippedMaxRetries: 0, abortedOffline: 0 });
      expect(mockStore.updatePending).toHaveBeenCalledWith("test-1", {
        status: "syncing",
      });
      expect(mockStore.removePending).toHaveBeenCalledWith("test-1");
      expect(onSyncStart).toHaveBeenCalled();
      expect(onSyncComplete).toHaveBeenCalledWith({ success: 1, failed: 0, skippedMaxRetries: 0, abortedOffline: 0 });
    });

    it("should handle API errors and increment attempts", async () => {
      const entry = createPendingEntry("test-1");
      (mockStore.getAllPending as Mock).mockResolvedValue([entry]);
      (createEntry as Mock).mockRejectedValue(new Error("Network error"));

      const result = await syncService.syncAll();

      expect(result).toEqual({ success: 0, failed: 1, skippedMaxRetries: 0, abortedOffline: 0 });
      // Status is "pending" (not "failed") so entry can be retried
      expect(mockStore.updatePending).toHaveBeenCalledWith("test-1", {
        status: "pending",
        attempts: 1,
        lastError: "Network error",
      });
      expect(mockStore.removePending).not.toHaveBeenCalled();
    });

    it("should skip entries that exceeded max retries", async () => {
      const entry = createPendingEntry("test-1", 3, "failed");
      (mockStore.getAllPending as Mock).mockResolvedValue([entry]);

      const result = await syncService.syncAll();

      // Max retries entries are tracked in skippedMaxRetries, not failed
      expect(result).toEqual({ success: 0, failed: 0, skippedMaxRetries: 1, abortedOffline: 0 });
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

      expect(result).toEqual({ success: 3, failed: 0, skippedMaxRetries: 0, abortedOffline: 0 });
      expect(createEntry).toHaveBeenCalledTimes(3);
    });

    it("should consider null response (duplicate) as success", async () => {
      const entry = createPendingEntry("test-1");
      (mockStore.getAllPending as Mock).mockResolvedValue([entry]);
      (createEntry as Mock).mockResolvedValue(null);

      const result = await syncService.syncAll();

      expect(result).toEqual({ success: 1, failed: 0, skippedMaxRetries: 0, abortedOffline: 0 });
      expect(mockStore.removePending).toHaveBeenCalledWith("test-1");
    });

    it("syncs queued updates after their queued create succeeds", async () => {
      const entry = createPendingEntry("test-1");
      const queuedUpdate = {
        id: "test-1",
        data: {
          id: "test-1",
          summary: "Updated summary",
        },
        queuedAt: Date.now(),
        attempts: 0,
        status: "pending" as const,
      };
      (mockStore.getAllPending as Mock).mockResolvedValue([entry]);
      (mockStore.getAllPendingUpdates as Mock).mockResolvedValue([queuedUpdate]);
      (createEntry as Mock).mockResolvedValue({ id: "test-1" });
      (updateEntry as Mock).mockResolvedValue({ id: "test-1" });

      const result = await syncService.syncAll();

      expect(result).toEqual({ success: 2, failed: 0, skippedMaxRetries: 0, abortedOffline: 0 });
      expect(mockStore.removePending).toHaveBeenCalledWith("test-1");
      expect(updateEntry).toHaveBeenCalledTimes(1);
      expect(mockStore.removePendingUpdate).toHaveBeenCalledWith("test-1");
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

  describe("sync lock (isSyncing)", () => {
    it("should return same promise if sync is already in progress", async () => {
      const entry = createPendingEntry("test-1");
      (mockStore.getAllPending as Mock).mockResolvedValue([entry]);

      // Create a delayed API call to keep first sync in progress
      let resolveFirstSync: () => void;
      const firstSyncPromise = new Promise<void>((resolve) => {
        resolveFirstSync = resolve;
      });
      (createEntry as Mock).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            firstSyncPromise.then(() => resolve({ id: "test-1" }));
          }),
      );

      // Start first sync (will be in progress)
      const firstSync = syncService.syncAll();

      // Attempt second sync while first is in progress - should return same promise
      const secondSync = syncService.syncAll();

      expect(syncService.getIsSyncing()).toBe(true);

      // Complete the first sync
      resolveFirstSync!();
      const firstResult = await firstSync;
      const secondResult = await secondSync;

      // Both should return the same result (from the same promise)
      expect(firstResult).toEqual({ success: 1, failed: 0, skippedMaxRetries: 0, abortedOffline: 0 });
      expect(secondResult).toEqual({ success: 1, failed: 0, skippedMaxRetries: 0, abortedOffline: 0 });
      expect(syncService.getIsSyncing()).toBe(false);
    });

    it("should reset isSyncing flag after sync completes with errors", async () => {
      const entry = createPendingEntry("test-1");
      (mockStore.getAllPending as Mock).mockResolvedValue([entry]);
      (createEntry as Mock).mockRejectedValue(new Error("API error"));

      await syncService.syncAll();

      // isSyncing should be reset even after failure
      expect(syncService.getIsSyncing()).toBe(false);
    });

    it("should reset isSyncing flag if store.getAllPending throws", async () => {
      (mockStore.getAllPending as Mock).mockRejectedValue(
        new Error("Store error"),
      );

      await syncService.syncAll();

      expect(syncService.getIsSyncing()).toBe(false);
      expect(onSyncError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe("network failure scenarios", () => {
    it("should handle 500 server error and mark entry as pending for retry", async () => {
      const entry = createPendingEntry("test-1");
      (mockStore.getAllPending as Mock).mockResolvedValue([entry]);
      (createEntry as Mock).mockRejectedValue(
        new Error("Request failed with status code 500"),
      );

      const result = await syncService.syncAll();

      expect(result).toEqual({ success: 0, failed: 1, skippedMaxRetries: 0, abortedOffline: 0 });
      // Status is "pending" so entry can be retried
      expect(mockStore.updatePending).toHaveBeenCalledWith("test-1", {
        status: "pending",
        attempts: 1,
        lastError: "Request failed with status code 500",
      });
    });

    it("should handle 404 not found error", async () => {
      const entry = createPendingEntry("test-1");
      (mockStore.getAllPending as Mock).mockResolvedValue([entry]);
      (createEntry as Mock).mockRejectedValue(
        new Error("Request failed with status code 404"),
      );

      const result = await syncService.syncAll();

      expect(result).toEqual({ success: 0, failed: 1, skippedMaxRetries: 0, abortedOffline: 0 });
      expect(mockStore.updatePending).toHaveBeenCalledWith("test-1", {
        status: "pending",
        attempts: 1,
        lastError: "Request failed with status code 404",
      });
    });

    it("should handle network timeout error", async () => {
      const entry = createPendingEntry("test-1");
      (mockStore.getAllPending as Mock).mockResolvedValue([entry]);
      (createEntry as Mock).mockRejectedValue(new Error("Network timeout"));

      const result = await syncService.syncAll();

      expect(result).toEqual({ success: 0, failed: 1, skippedMaxRetries: 0, abortedOffline: 0 });
      expect(mockStore.updatePending).toHaveBeenCalledWith("test-1", {
        status: "pending",
        attempts: 1,
        lastError: "Network timeout",
      });
    });

    it("should continue syncing other entries after one fails", async () => {
      const entries = [
        createPendingEntry("test-1"),
        createPendingEntry("test-2"),
        createPendingEntry("test-3"),
      ];
      (mockStore.getAllPending as Mock).mockResolvedValue(entries);
      (createEntry as Mock)
        .mockResolvedValueOnce({ id: "test-1" })
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({ id: "test-3" });

      const result = await syncService.syncAll();

      expect(result).toEqual({ success: 2, failed: 1, skippedMaxRetries: 0, abortedOffline: 0 });
      expect(mockStore.removePending).toHaveBeenCalledWith("test-1");
      expect(mockStore.removePending).toHaveBeenCalledWith("test-3");
      expect(mockStore.removePending).not.toHaveBeenCalledWith("test-2");
    });
  });

  describe("max retries behavior", () => {
    it("should increment attempts on each failure until max is reached", async () => {
      // First sync attempt - entry has 0 attempts
      const entryAttempt0 = createPendingEntry("test-1", 0, "pending");
      (mockStore.getAllPending as Mock).mockResolvedValueOnce([entryAttempt0]);
      (createEntry as Mock).mockRejectedValueOnce(new Error("Attempt 1 failed"));

      await syncService.syncAll();

      // Status stays "pending" so entry can be retried
      expect(mockStore.updatePending).toHaveBeenCalledWith("test-1", {
        status: "pending",
        attempts: 1,
        lastError: "Attempt 1 failed",
      });

      // Second sync attempt - entry now has 1 attempt
      const entryAttempt1 = createPendingEntry("test-1", 1, "pending");
      (mockStore.getAllPending as Mock).mockResolvedValueOnce([entryAttempt1]);
      (createEntry as Mock).mockRejectedValueOnce(new Error("Attempt 2 failed"));

      await syncService.syncAll();

      expect(mockStore.updatePending).toHaveBeenCalledWith("test-1", {
        status: "pending",
        attempts: 2,
        lastError: "Attempt 2 failed",
      });

      // Third sync attempt - entry now has 2 attempts
      const entryAttempt2 = createPendingEntry("test-1", 2, "pending");
      (mockStore.getAllPending as Mock).mockResolvedValueOnce([entryAttempt2]);
      (createEntry as Mock).mockRejectedValueOnce(new Error("Attempt 3 failed"));

      await syncService.syncAll();

      expect(mockStore.updatePending).toHaveBeenCalledWith("test-1", {
        status: "pending",
        attempts: 3,
        lastError: "Attempt 3 failed",
      });

      // Fourth sync attempt - entry has 3 attempts, should be skipped
      const entryAttempt3 = createPendingEntry("test-1", 3, "pending");
      (mockStore.getAllPending as Mock).mockResolvedValueOnce([entryAttempt3]);

      const result = await syncService.syncAll();

      // Entry is tracked in skippedMaxRetries, not failed
      expect(result).toEqual({ success: 0, failed: 0, skippedMaxRetries: 1, abortedOffline: 0 });
      // createEntry should not be called for this entry
      expect(createEntry).toHaveBeenCalledTimes(3); // Only 3 times total from previous attempts
    });

    it("should skip entry with max attempts and not retry", async () => {
      const maxRetriesEntry = createPendingEntry("test-1", 3, "pending");
      (mockStore.getAllPending as Mock).mockResolvedValue([maxRetriesEntry]);

      const result = await syncService.syncAll();

      // Max retries entries are tracked separately
      expect(result).toEqual({ success: 0, failed: 0, skippedMaxRetries: 1, abortedOffline: 0 });
      expect(createEntry).not.toHaveBeenCalled();
      expect(mockStore.updatePending).not.toHaveBeenCalled();
      expect(mockStore.removePending).not.toHaveBeenCalled();
    });

    it("should handle mixed entries with some at max retries", async () => {
      const entries = [
        createPendingEntry("test-1", 3, "pending"), // Max retries - should skip
        createPendingEntry("test-2", 0, "pending"), // Fresh - should sync
        createPendingEntry("test-3", 2, "pending"), // 2 attempts - should try once more
      ];
      (mockStore.getAllPending as Mock).mockResolvedValue(entries);
      (createEntry as Mock)
        .mockResolvedValueOnce({ id: "test-2" })
        .mockRejectedValueOnce(new Error("Failed again"));

      const result = await syncService.syncAll();

      // 1 skipped (max retries), 1 success, 1 failed
      expect(result).toEqual({ success: 1, failed: 1, skippedMaxRetries: 1, abortedOffline: 0 });
      expect(createEntry).toHaveBeenCalledTimes(2); // Only test-2 and test-3
      expect(mockStore.removePending).toHaveBeenCalledWith("test-2");
      expect(mockStore.updatePending).toHaveBeenCalledWith("test-3", {
        status: "pending",
        attempts: 3,
        lastError: "Failed again",
      });
    });
  });
});
