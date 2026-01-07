import { createContext } from "react";

import type { CreateEntryInput } from "@/api/entries";
import type { PendingEntry, SyncResult } from "@/lib/sync";

export interface SyncContextValue {
  /** Whether the browser is currently online */
  isOnline: boolean;
  /** Number of entries pending sync */
  pendingCount: number;
  /** List of pending entries */
  pendingEntries: PendingEntry[];
  /** Whether sync is currently in progress */
  isSyncing: boolean;
  /** Result of the last sync operation */
  lastSyncResult?: SyncResult;
  /** Manually trigger sync */
  syncNow: () => Promise<void>;
  /** Queue an entry for offline sync */
  queueEntry: (input: CreateEntryInput) => Promise<void>;
}

export const SyncContext = createContext<SyncContextValue | null>(null);
