import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { CreateEntryInput } from "@/api/entries";
import {
  IdbSyncStore,
  SyncService,
  type PendingEntry,
  type SyncResult,
} from "@/lib/sync";

import { SyncContext, type SyncContextValue } from "./SyncContext";

const HEALTH_CHECK_INTERVAL = 10_000; // 10 seconds
const HEALTH_CHECK_URL = "/api/health";

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
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | undefined>();

  // Mark server as unreachable (called by API consumers on network errors)
  const markServerUnreachable = useCallback(() => {
    setIsServerReachable(false);
  }, []);

  // Use ref for refreshPending to avoid stale closures in SyncService callbacks
  const refreshPendingRef = useRef<() => Promise<void>>();

  // Refresh pending state from store
  const refreshPending = useCallback(async () => {
    // Guard: don't access store before initialization completes
    if (!isInitialized) return;

    const store = storeRef.current;
    if (!store) return;

    try {
      const count = await store.getPendingCount();
      const entries = await store.getAllPending();
      setPendingCount(count);
      setPendingEntries(entries);
    } catch (error) {
      // Store might not be ready yet, ignore
      console.warn("Failed to refresh pending entries:", error);
    }
  }, [isInitialized]);

  // Keep ref updated with latest refreshPending
  refreshPendingRef.current = refreshPending;

  // Initialize store and service
  useEffect(() => {
    const store = new IdbSyncStore();
    storeRef.current = store;

    const service = new SyncService({
      store,
      queryClient,
      onSyncStart: () => setIsSyncing(true),
      onSyncComplete: (result) => {
        setIsSyncing(false);
        setLastSyncResult(result);
        void refreshPendingRef.current?.();
      },
      onSyncError: () => setIsSyncing(false),
    });
    serviceRef.current = service;

    store
      .init()
      .then(() => {
        setIsInitialized(true);
      })
      .catch((error: unknown) => {
        console.warn("IndexedDB unavailable, offline sync disabled:", error);
        setIsOfflineSyncAvailable(false);
        // Still mark as initialized so app can work without offline sync
        setIsInitialized(true);
      });
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

    const checkHealth = async () => {
      try {
        const response = await fetch(HEALTH_CHECK_URL, {
          method: "GET",
          cache: "no-store",
        });
        if (response.ok) {
          setIsServerReachable(true);
          // Sync pending entries now that server is back
          void serviceRef.current?.syncAll();
        }
      } catch {
        // Still unreachable, will retry
      }
    };

    // Check immediately
    void checkHealth();

    // Then check periodically
    const intervalId = setInterval(checkHealth, HEALTH_CHECK_INTERVAL);

    return () => clearInterval(intervalId);
  }, [isBrowserOnline, isServerReachable]);

  // Sync on focus/visibility (iOS PWA workaround - no Background Sync API)
  useEffect(() => {
    const handleSync = () => {
      if (navigator.onLine && serviceRef.current && isInitialized) {
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
  }, [isInitialized]);

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

  const value = useMemo<SyncContextValue>(
    () => ({
      isOnline,
      isOfflineSyncAvailable,
      pendingCount,
      pendingEntries,
      isSyncing,
      lastSyncResult,
      syncNow,
      queueEntry,
      markServerUnreachable,
    }),
    [
      isOnline,
      isOfflineSyncAvailable,
      pendingCount,
      pendingEntries,
      isSyncing,
      lastSyncResult,
      syncNow,
      queueEntry,
      markServerUnreachable,
    ],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
