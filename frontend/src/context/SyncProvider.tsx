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

export function SyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // Service references - initialized once
  const storeRef = useRef<IdbSyncStore | null>(null);
  const serviceRef = useRef<SyncService | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // State
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | undefined>();

  // Refresh pending state from store
  const refreshPending = useCallback(async () => {
    const store = storeRef.current;
    if (!store) return;

    const count = await store.getPendingCount();
    const entries = await store.getAllPending();
    setPendingCount(count);
    setPendingEntries(entries);
  }, []);

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
        void refreshPending();
      },
      onSyncError: () => setIsSyncing(false),
    });
    serviceRef.current = service;

    void store.init().then(() => {
      setIsInitialized(true);
      void refreshPending();
    });
  }, [queryClient, refreshPending]);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Sync when coming back online
      void serviceRef.current?.syncAll();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

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
      pendingCount,
      pendingEntries,
      isSyncing,
      lastSyncResult,
      syncNow,
      queueEntry,
    }),
    [
      isOnline,
      pendingCount,
      pendingEntries,
      isSyncing,
      lastSyncResult,
      syncNow,
      queueEntry,
    ],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
