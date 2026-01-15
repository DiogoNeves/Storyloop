import type { CreateEntryInput } from "@/api/entries";
import type { UpdateEntryInput } from "@/api/entries";

/**
 * Status of a pending entry in the sync queue.
 */
export type PendingEntryStatus = "pending" | "syncing" | "failed";

/**
 * Pending entry stored for offline sync.
 * Extends CreateEntryInput with sync metadata.
 */
export interface PendingEntry {
  /** Entry ID (same as the entry's id field) */
  id: string;
  /** The entry data to sync */
  data: CreateEntryInput;
  /** Timestamp when queued (for ordering) */
  queuedAt: number;
  /** Number of sync attempts */
  attempts: number;
  /** Current status */
  status: PendingEntryStatus;
  /** Last error message if sync failed */
  lastError?: string;
}

/**
 * Pending update stored for offline sync.
 */
export interface PendingEntryUpdate {
  /** Entry ID (same as the entry's id field) */
  id: string;
  /** The entry update data to sync */
  data: UpdateEntryInput;
  /** Timestamp when queued (for ordering) */
  queuedAt: number;
  /** Number of sync attempts */
  attempts: number;
  /** Current status */
  status: PendingEntryStatus;
  /** Last error message if sync failed */
  lastError?: string;
}

/**
 * SyncStore interface - abstracts storage for offline sync.
 *
 * This interface can be implemented with IndexedDB, RxDB, PowerSync, etc.
 * The abstraction allows swapping storage backends without changing the UI layer.
 */
export interface SyncStore {
  /** Initialize the store (open DB, run migrations) */
  init(): Promise<void>;

  /** Add a new pending entry to the sync queue */
  addPending(entry: PendingEntry): Promise<void>;

  /** Get all pending entries, ordered by queuedAt */
  getAllPending(): Promise<PendingEntry[]>;

  /** Get a single pending entry by ID */
  getPending(id: string): Promise<PendingEntry | undefined>;

  /** Update a pending entry (e.g., increment attempts, set error) */
  updatePending(id: string, updates: Partial<PendingEntry>): Promise<void>;

  /** Remove a pending entry (after successful sync) */
  removePending(id: string): Promise<void>;

  /** Get count of pending entries */
  getPendingCount(): Promise<number>;

  /** Add a new pending update to the sync queue */
  addPendingUpdate(update: PendingEntryUpdate): Promise<void>;

  /** Get all pending updates, ordered by queuedAt */
  getAllPendingUpdates(): Promise<PendingEntryUpdate[]>;

  /** Get a single pending update by ID */
  getPendingUpdate(id: string): Promise<PendingEntryUpdate | undefined>;

  /** Update a pending update (e.g., increment attempts, set error) */
  updatePendingUpdate(
    id: string,
    updates: Partial<PendingEntryUpdate>,
  ): Promise<void>;

  /** Remove a pending update (after successful sync) */
  removePendingUpdate(id: string): Promise<void>;

  /** Get count of pending updates */
  getPendingUpdateCount(): Promise<number>;

  /** Clear all pending entries (for testing/reset) */
  clearAll(): Promise<void>;
}
