import type { QueryClient } from "@tanstack/react-query";

import { createEntry, entriesQueries, type CreateEntryInput } from "@/api/entries";

import type { PendingEntry, SyncStore } from "./types";

const MAX_RETRY_ATTEMPTS = 3;

export interface SyncResult {
  success: number;
  failed: number;
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
 */
export class SyncService {
  private store: SyncStore;
  private queryClient: QueryClient;
  private options: SyncServiceOptions;
  private isSyncing = false;

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

  /** Attempt to sync all pending entries */
  async syncAll(): Promise<SyncResult> {
    if (this.isSyncing || !this.isOnline()) {
      return { success: 0, failed: 0 };
    }

    this.isSyncing = true;
    this.options.onSyncStart?.();

    let successCount = 0;
    let failCount = 0;

    try {
      const pending = await this.store.getAllPending();

      for (const entry of pending) {
        // Skip entries that have exceeded retry limit
        if (entry.attempts >= MAX_RETRY_ATTEMPTS) {
          failCount++;
          continue;
        }

        try {
          // Mark as syncing
          await this.store.updatePending(entry.id, { status: "syncing" });

          // Attempt API call
          const result = await createEntry(entry.data);

          if (result) {
            // Success - remove from queue
            await this.store.removePending(entry.id);
            successCount++;
          } else {
            // Server returned null (duplicate) - still consider success, remove from queue
            await this.store.removePending(entry.id);
            successCount++;
          }
        } catch (error) {
          // Failed - increment attempts and record error
          await this.store.updatePending(entry.id, {
            status: "failed",
            attempts: entry.attempts + 1,
            lastError: error instanceof Error ? error.message : "Unknown error",
          });
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

      this.options.onSyncComplete?.({ success: successCount, failed: failCount });
    } catch (error) {
      this.options.onSyncError?.(
        error instanceof Error ? error : new Error("Sync failed"),
      );
    } finally {
      this.isSyncing = false;
    }

    return { success: successCount, failed: failCount };
  }

  /** Get count of pending entries */
  async getPendingCount(): Promise<number> {
    return this.store.getPendingCount();
  }

  /** Get all pending entries */
  async getPendingEntries(): Promise<PendingEntry[]> {
    return this.store.getAllPending();
  }

  /** Check if currently syncing */
  getIsSyncing(): boolean {
    return this.isSyncing;
  }
}
