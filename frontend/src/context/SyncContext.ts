import { createContext } from "react";

import type { CreateEntryInput } from "@/api/entries";
import type { PendingEntry, SyncResult } from "@/lib/sync";

export interface SyncContextValue {
  /** Whether the app can reach the server (navigator.onLine AND server reachable) */
  isOnline: boolean;
  /** Whether IndexedDB is available for offline sync */
  isOfflineSyncAvailable: boolean;
  /** Number of entries pending sync */
  pendingCount: number;
  /** List of pending entries */
  pendingEntries: PendingEntry[];
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
  /** Mark server as unreachable (call on network errors) */
  markServerUnreachable: () => void;
  /** Clear the last sync error */
  clearSyncError: () => void;
}

export const SyncContext = createContext<SyncContextValue | null>(null);
