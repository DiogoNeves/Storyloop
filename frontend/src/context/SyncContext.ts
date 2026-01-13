import { createContext } from "react";

import type { CreateEntryInput, UpdateEntryInput } from "@/api/entries";
import type { PendingEntry, PendingEntryUpdate, SyncResult } from "@/lib/sync";

/**
 * Shared offline-sync state for the UI.
 *
 * isOnline reflects browser connectivity plus a reachable backend.
 * Offline sync is only enabled when IndexedDB is available.
 */
export interface SyncContextValue {
  /** Whether the app can reach the server (navigator.onLine AND server reachable) */
  isOnline: boolean;
  /** Whether IndexedDB is available for offline sync */
  isOfflineSyncAvailable: boolean;
  /** Number of entries pending sync */
  pendingCount: number;
  /** List of pending entries */
  pendingEntries: PendingEntry[];
  /** List of pending entry updates */
  pendingEntryUpdates: PendingEntryUpdate[];
  /** Whether sync is currently in progress */
  isSyncing: boolean;
  /** Result of the last sync operation */
  lastSyncResult?: SyncResult;
  /** Error from the last sync operation, if any */
  lastSyncError?: Error;
  /** Manually trigger sync */
  syncNow: () => Promise<void>;
  /** Queue an entry for offline sync */
  queueEntry: (input: CreateEntryInput) => Promise<void>;
  /** Queue an entry update for offline sync */
  queueEntryUpdate: (input: UpdateEntryInput) => Promise<void>;
  /** Remove a pending entry update */
  removePendingEntryUpdate: (id: string) => Promise<void>;
  /** Mark server as unreachable (call on network errors) */
  markServerUnreachable: () => void;
  /** Clear the last sync error */
  clearSyncError: () => void;
}

export const SyncContext = createContext<SyncContextValue | null>(null);
