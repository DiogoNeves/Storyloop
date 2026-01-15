import { useContext } from "react";

import { SyncContext, type SyncContextValue } from "@/context/SyncContext";

/**
 * Hook to access sync state and actions.
 *
 * Provides:
 * - isOnline: whether the browser is currently online
 * - pendingCount: number of pending changes waiting to sync
 * - pendingEntries: list of pending entry creates
 * - pendingEntryUpdates: list of pending entry updates
 * - isSyncing: whether sync is in progress
 * - syncNow: manually trigger sync
 * - queueEntry: queue an entry for offline sync
 * - queueEntryUpdate: queue an entry update for offline sync
 */
export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSync must be used within a SyncProvider");
  }
  return context;
}
