import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { CreateEntryInput, UpdateEntryInput } from "@/api/entries";
import {
  IdbSyncStore,
  SyncService,
  type PendingEntry,
  type PendingEntryUpdate,
  type SyncResult,
} from "@/lib/sync";

import { SyncContext, type SyncContextValue } from "./SyncContext";

const HEALTH_CHECK_INTERVAL = 10_000; // 10 seconds
const HEALTH_CHECK_URL = "/health";

export function SyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // Service references - initialized once
  const storeRef = useRef<IdbSyncStore | null>(null);
  const serviceRef = useRef<SyncService | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isOfflineSyncAvailable, setIsOfflineSyncAvailable] = useState(true);

  // Browser connectivity state
  const [isBrowserOnline, setIsBrowserOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  // Server reachability state
  const [isServerReachable, setIsServerReachable] = useState(true);

  // Combined online state: browser must be online AND server must be reachable
  const isOnline = isBrowserOnline && isServerReachable;

  const [pendingCount, setPendingCount] = useState(0);
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([]);
  const [pendingEntryUpdates, setPendingEntryUpdates] = useState<
    PendingEntryUpdate[]
  >([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | undefined>();
  const [lastSyncError, setLastSyncError] = useState<Error | undefined>();

  // Mark server as unreachable (called by API consumers on network errors)
  const markServerUnreachable = useCallback(() => {
    setIsServerReachable(false);
  }, []);

  // Clear sync error (called by UI after user acknowledges)
  const clearSyncError = useCallback(() => {
    setLastSyncError(undefined);
  }, []);

  // Use ref for refreshPending to avoid stale closures in SyncService callbacks
  const refreshPendingRef = useRef<(() => Promise<void>) | undefined>(undefined);

  // Refresh pending state from store
  const refreshPending = useCallback(async () => {
    // Guard: don't access store before initialization completes
    if (!isInitialized) return;

    const store = storeRef.current;
    if (!store) return;

    try {
      const count = await store.getPendingCount();
      const updateCount = await store.getPendingUpdateCount();
      const entries = await store.getAllPending();
      const updates = await store.getAllPendingUpdates();
      setPendingEntries(entries);
      setPendingEntryUpdates(updates);
      setPendingCount(count + updateCount);
    } catch (error) {
      // Store might not be ready yet, ignore
      console.warn("Failed to refresh pending entries:", error);
    }
  }, [isInitialized]);

  // Keep ref updated with latest refreshPending
  refreshPendingRef.current = refreshPending;

  // Initialize store and service
  useEffect(() => {
    let isMounted = true;
    const store = new IdbSyncStore();
    storeRef.current = store;

    const service = new SyncService({
      store,
      queryClient,
      onSyncStart: () => {
        setIsSyncing(true);
        setLastSyncError(undefined); // Clear previous error on new sync
      },
      onSyncComplete: (result) => {
        setIsSyncing(false);
        setLastSyncResult(result);
        void refreshPendingRef.current?.();
      },
      onSyncError: (error) => {
        setIsSyncing(false);
        setLastSyncError(error);
      },
    });
    serviceRef.current = service;

    store
      .init()
      .then(() => {
        if (!isMounted) {
          return;
        }
        setIsInitialized(true);
      })
      .catch((error: unknown) => {
        if (!isMounted) {
          return;
        }
        console.warn("IndexedDB unavailable, offline sync disabled:", error);
        setIsOfflineSyncAvailable(false);
        // Still mark as initialized so app can work without offline sync
        setIsInitialized(true);
      });

    return () => {
      isMounted = false;
    };
  }, [queryClient]);

  // Refresh pending entries when initialization completes
  useEffect(() => {
    if (isInitialized) {
      void refreshPending();
    }
  }, [isInitialized, refreshPending]);

  // Browser online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsBrowserOnline(true);
      // Reset server reachable assumption when browser comes online
      setIsServerReachable(true);
      // Sync when coming back online
      void serviceRef.current?.syncAll();
    };

    const handleOffline = () => {
      setIsBrowserOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Health check to restore server reachability
  useEffect(() => {
    // Only run health check when browser is online but server was marked unreachable
    if (!isBrowserOnline || isServerReachable) {
      return;
    }

    const controller = new AbortController();

    const checkHealth = async () => {
      try {
        const response = await fetch(HEALTH_CHECK_URL, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok) {
          setIsServerReachable(true);
          // Sync pending entries now that server is back
          void serviceRef.current?.syncAll();
        }
      } catch (error) {
        // Ignore abort errors (expected on cleanup)
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        // Still unreachable, will retry
      }
    };

    // Check immediately
    void checkHealth();

    // Then check periodically
    const intervalId = setInterval(checkHealth, HEALTH_CHECK_INTERVAL);

    return () => {
      controller.abort();
      clearInterval(intervalId);
    };
  }, [isBrowserOnline, isServerReachable]);

  // Sync on focus/visibility (iOS PWA workaround - no Background Sync API)
  // Uses combined online state (browser online + server reachable)
  useEffect(() => {
    const handleSync = () => {
      // Use combined online state instead of just navigator.onLine
      if (isBrowserOnline && isServerReachable && serviceRef.current && isInitialized) {
        void serviceRef.current.syncAll();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleSync();
      }
    };

    window.addEventListener("focus", handleSync);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleSync);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isInitialized, isBrowserOnline, isServerReachable]);

  // Manual sync trigger
  const syncNow = useCallback(async () => {
    await serviceRef.current?.syncAll();
  }, []);

  // Queue entry for offline sync
  const queueEntry = useCallback(
    async (input: CreateEntryInput) => {
      const service = serviceRef.current;
      if (!service) return;

      await service.queueEntry(input);
      await refreshPending();
    },
    [refreshPending],
  );

  const queueEntryUpdate = useCallback(
    async (input: UpdateEntryInput) => {
      const service = serviceRef.current;
      if (!service) return;

      await service.queueEntryUpdate(input);
      await refreshPending();
    },
    [refreshPending],
  );

  const removePendingEntryUpdate = useCallback(
    async (id: string) => {
      const service = serviceRef.current;
      if (!service) return;

      await service.removePendingEntryUpdate(id);
      await refreshPending();
    },
    [refreshPending],
  );

  const value = useMemo<SyncContextValue>(
    () => ({
      isOnline,
      isOfflineSyncAvailable,
      pendingCount,
      pendingEntries,
      pendingEntryUpdates,
      isSyncing,
      lastSyncResult,
      lastSyncError,
      syncNow,
      queueEntry,
      queueEntryUpdate,
      removePendingEntryUpdate,
      markServerUnreachable,
      clearSyncError,
    }),
    [
      isOnline,
      isOfflineSyncAvailable,
      pendingCount,
      pendingEntries,
      pendingEntryUpdates,
      isSyncing,
      lastSyncResult,
      lastSyncError,
      syncNow,
      queueEntry,
      queueEntryUpdate,
      removePendingEntryUpdate,
      markServerUnreachable,
      clearSyncError,
    ],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
