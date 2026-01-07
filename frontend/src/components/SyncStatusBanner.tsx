import { CloudOff, RefreshCw } from "lucide-react";

import { useSync } from "@/hooks/useSync";
import { cn } from "@/lib/utils";

/**
 * Banner that shows when there are pending entries to sync.
 * Displays count and a "Sync now" button.
 */
export function SyncStatusBanner() {
  const { isOnline, pendingCount, isSyncing, syncNow } = useSync();

  // Only show when there are pending entries
  if (pendingCount === 0) {
    return null;
  }

  const handleSyncClick = () => {
    void syncNow();
  };

  return (
    <div
      className="flex items-center justify-between gap-2 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <CloudOff className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {pendingCount} pending {pendingCount === 1 ? "entry" : "entries"} to
          sync
        </span>
      </div>
      {isOnline && (
        <button
          type="button"
          onClick={handleSyncClick}
          disabled={isSyncing}
          className="flex items-center gap-1 text-sm font-medium underline-offset-2 hover:underline disabled:opacity-50"
        >
          <RefreshCw
            className={cn("h-4 w-4", isSyncing && "animate-spin")}
            aria-hidden="true"
          />
          {isSyncing ? "Syncing..." : "Sync now"}
        </button>
      )}
    </div>
  );
}
