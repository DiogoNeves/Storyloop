import type { QueryClient } from "@tanstack/react-query";

import {
  createEntry,
  entriesQueries,
  updateEntry,
  type CreateEntryInput,
  type UpdateEntryInput,
} from "@/api/entries";

import type { PendingEntry, PendingEntryUpdate, SyncStore } from "./types";

const MAX_RETRY_ATTEMPTS = 3;

export interface SyncResult {
  success: number;
  failed: number;
  skippedMaxRetries: number;
  abortedOffline: number;
}

export interface SyncServiceOptions {
  store: SyncStore;
  queryClient: QueryClient;
  onSyncStart?: () => void;
  onSyncComplete?: (result: SyncResult) => void;
  onSyncError?: (error: Error) => void;
}

/**
 * SyncService orchestrates offline sync operations.
 *
 * Responsibilities:
 * - Queue entries for offline sync
 * - Sync pending entries when online
 * - Retry failed syncs (max 3 attempts)
 * - Invalidate TanStack Query cache on successful sync
 *
 * Sync triggers are event-based (online/focus/visibility) because iOS Safari
 * does not support the Background Sync API.
 */
export class SyncService {
  private store: SyncStore;
  private queryClient: QueryClient;
  private options: SyncServiceOptions;
  /** Promise-based lock to prevent concurrent syncs (fixes race condition) */
  private syncPromise: Promise<SyncResult> | null = null;

  constructor(options: SyncServiceOptions) {
    this.store = options.store;
    this.queryClient = options.queryClient;
    this.options = options;
  }

  /** Check if browser is currently online */
  isOnline(): boolean {
    return typeof navigator !== "undefined" ? navigator.onLine : true;
  }

  /** Queue an entry for offline sync */
  async queueEntry(input: CreateEntryInput): Promise<void> {
    const pendingEntry: PendingEntry = {
      id: input.id,
      data: input,
      queuedAt: Date.now(),
      attempts: 0,
      status: "pending",
    };
    await this.store.addPending(pendingEntry);
  }

  /** Queue an entry update for offline sync */
  async queueEntryUpdate(input: UpdateEntryInput): Promise<void> {
    const pendingUpdate: PendingEntryUpdate = {
      id: input.id,
      data: input,
      queuedAt: Date.now(),
      attempts: 0,
      status: "pending",
    };
    await this.store.addPendingUpdate(pendingUpdate);
  }

  /**
   * Attempt to sync all pending entries.
   * Uses promise-based lock to prevent concurrent syncs.
   */
  async syncAll(): Promise<SyncResult> {
    // Return existing sync promise if one is in progress (prevents concurrent syncs)
    if (this.syncPromise) {
      return this.syncPromise;
    }

    if (!this.isOnline()) {
      return { success: 0, failed: 0, skippedMaxRetries: 0, abortedOffline: 0 };
    }

    // Create and store the sync promise before starting
    this.syncPromise = this.doSync();

    try {
      return await this.syncPromise;
    } finally {
      this.syncPromise = null;
    }
  }

  /** Internal sync implementation */
  private async doSync(): Promise<SyncResult> {
    this.options.onSyncStart?.();

    let successCount = 0;
    let failCount = 0;
    let skippedMaxRetries = 0;
    let abortedOffline = 0;

    try {
      const pending = await this.store.getAllPending();
      const pendingUpdates = await this.store.getAllPendingUpdates();
      const pendingEntryIds = new Set(pending.map((entry) => entry.id));

      for (const entry of pending) {
        // Check connectivity before each entry (handles mid-sync network loss)
        if (!this.isOnline()) {
          abortedOffline++;
          continue;
        }

        // Skip and track entries that exceeded retry limit (zombie entries)
        if (entry.attempts >= MAX_RETRY_ATTEMPTS) {
          skippedMaxRetries++;
          continue;
        }

        try {
          // Mark as syncing
          await this.store.updatePending(entry.id, { status: "syncing" });

          // Attempt API call (result is Entry or null for duplicate)
          await createEntry(entry.data);

          // Success - remove from queue
          try {
            await this.store.removePending(entry.id);
          } catch (storageError) {
            // Log but count as success - entry is on server
            console.warn("Failed to remove synced entry from queue:", storageError);
          }
          successCount++;
        } catch (error) {
          // Failed - restore to pending status (not "failed") for retry
          try {
            await this.store.updatePending(entry.id, {
              status: "pending",
              attempts: entry.attempts + 1,
              lastError: error instanceof Error ? error.message : "Unknown error",
            });
          } catch (updateError) {
            // Storage broken - log but continue with other entries
            console.error("Failed to update entry status after sync error:", updateError);
          }
          failCount++;
        }
      }

      for (const update of pendingUpdates) {
        if (!this.isOnline()) {
          abortedOffline++;
          continue;
        }

        if (update.attempts >= MAX_RETRY_ATTEMPTS) {
          skippedMaxRetries++;
          continue;
        }

        if (pendingEntryIds.has(update.id)) {
          continue;
        }

        try {
          await this.store.updatePendingUpdate(update.id, { status: "syncing" });

          await updateEntry(update.data);

          try {
            await this.store.removePendingUpdate(update.id);
          } catch (storageError) {
            console.warn(
              "Failed to remove synced entry update from queue:",
              storageError,
            );
          }
          successCount++;
        } catch (error) {
          try {
            await this.store.updatePendingUpdate(update.id, {
              status: "pending",
              attempts: update.attempts + 1,
              lastError: error instanceof Error ? error.message : "Unknown error",
            });
          } catch (updateError) {
            console.error(
              "Failed to update entry update status after sync error:",
              updateError,
            );
          }
          failCount++;
        }
      }

      // Invalidate entries query to refresh data from server
      if (successCount > 0) {
        const listQuery = entriesQueries.all();
        await this.queryClient.invalidateQueries({
          queryKey: listQuery.queryKey,
        });
      }

      const result: SyncResult = {
        success: successCount,
        failed: failCount,
        skippedMaxRetries,
        abortedOffline,
      };
      this.options.onSyncComplete?.(result);
      return result;
    } catch (error) {
      this.options.onSyncError?.(
        error instanceof Error ? error : new Error("Sync failed"),
      );
      return { success: successCount, failed: failCount, skippedMaxRetries, abortedOffline };
    }
  }

  /** Get count of pending entries (excludes permanently failed) */
  async getPendingCount(): Promise<number> {
    return this.store.getPendingCount();
  }

  /** Get all pending entries */
  async getPendingEntries(): Promise<PendingEntry[]> {
    return this.store.getAllPending();
  }

  /** Get all pending updates */
  async getPendingEntryUpdates(): Promise<PendingEntryUpdate[]> {
    return this.store.getAllPendingUpdates();
  }

  /** Remove a pending update */
  async removePendingEntryUpdate(id: string): Promise<void> {
    await this.store.removePendingUpdate(id);
  }

  /** Check if currently syncing */
  getIsSyncing(): boolean {
    return this.syncPromise !== null;
  }

  /** Remove an entry that has permanently failed (user action) */
  async removePermanentlyFailed(id: string): Promise<void> {
    await this.store.removePending(id);
  }

  /** Retry a failed entry by resetting its attempt count */
  async retryEntry(id: string): Promise<void> {
    await this.store.updatePending(id, {
      status: "pending",
      attempts: 0,
      lastError: undefined,
    });
  }
}
