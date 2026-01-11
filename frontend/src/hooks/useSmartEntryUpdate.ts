import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { entriesQueries, streamSmartEntryUpdate } from "@/api/entries";

interface UseSmartEntryUpdateOptions {
  entryId?: string | null;
  enabled?: boolean;
}

export interface SmartEntryUpdateState {
  isUpdating: boolean;
  streamedContent: string;
  latestToolCall: string | null;
  error: string | null;
  startUpdate: () => Promise<void>;
  stopUpdate: () => void;
}

export function useSmartEntryUpdate({
  entryId,
  enabled = true,
}: UseSmartEntryUpdateOptions): SmartEntryUpdateState {
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const [latestToolCall, setLatestToolCall] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stopUpdate = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsUpdating(false);
  }, []);

  const startUpdate = useCallback(async () => {
    if (!entryId || !enabled) {
      return;
    }

    stopUpdate();
    setIsUpdating(true);
    setStreamedContent("");
    setLatestToolCall(null);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamSmartEntryUpdate({
        entryId,
        signal: controller.signal,
        callbacks: {
          onToken: (token) => {
            setStreamedContent((previous) => `${previous}${token}`);
          },
          onToolCall: (message) => {
            setLatestToolCall(message);
          },
          onDone: () => {
            setIsUpdating(false);
            const listQuery = entriesQueries.all();
            void queryClient.invalidateQueries({ queryKey: listQuery.queryKey });
            const byIdQuery = entriesQueries.byId(entryId);
            void queryClient.invalidateQueries({ queryKey: byIdQuery.queryKey });
          },
          onError: (message) => {
            setIsUpdating(false);
            setError(message);
          },
        },
      });
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") {
        return;
      }
      const message =
        caught instanceof Error
          ? caught.message
          : "Loopie couldn't update this smart entry.";
      setIsUpdating(false);
      setError(message);
    }
  }, [enabled, entryId, queryClient, stopUpdate]);

  useEffect(() => {
    stopUpdate();
    setStreamedContent("");
    setLatestToolCall(null);
    setError(null);
  }, [entryId, stopUpdate]);

  useEffect(() => {
    return () => {
      stopUpdate();
    };
  }, [stopUpdate]);

  return {
    isUpdating,
    streamedContent,
    latestToolCall,
    error,
    startUpdate,
    stopUpdate,
  };
}
