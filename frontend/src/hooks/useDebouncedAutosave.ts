import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  entriesQueries,
  updateEntry,
  type UpdateEntryInput,
} from "@/api/entries";
import { useSync } from "@/hooks/useSync";
import { compareEntriesByPinnedDate, type Entry } from "@/lib/types/entries";

type AutosaveStatus = "idle" | "dirty" | "saving" | "queued" | "error";

interface UseDebouncedAutosaveOptions {
  entryId: string | null;
  title: string;
  summary: string;
  enabled: boolean;
  isBlocked?: boolean;
  debounceMs?: number;
}

interface AutosaveState {
  status: AutosaveStatus;
  errorMessage: string | null;
}

export function useDebouncedAutosave({
  entryId,
  title,
  summary,
  enabled,
  isBlocked = false,
  debounceMs = 1000,
}: UseDebouncedAutosaveOptions) {
  const queryClient = useQueryClient();
  const { isOnline, queueEntryUpdate, removePendingEntryUpdate } = useSync();
  const [state, setState] = useState<AutosaveState>({
    status: "idle",
    errorMessage: null,
  });

  const baselineRef = useRef({ title, summary });
  const saveVersionRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateEntryMutation = useMutation({
    mutationFn: updateEntry,
  });

  const reset = (nextTitle: string, nextSummary: string) => {
    baselineRef.current = { title: nextTitle, summary: nextSummary };
    setState({ status: "idle", errorMessage: null });
  };

  const saveNow = useCallback(
    async (trimmedTitle: string, nextSummary: string) => {
    if (!entryId || trimmedTitle.length === 0) {
      setState({
        status: "error",
        errorMessage: "Add a title before saving.",
      });
      return;
    }

    const version = saveVersionRef.current + 1;
    saveVersionRef.current = version;
    setState({ status: "saving", errorMessage: null });

    const payload: UpdateEntryInput = {
      id: entryId,
      title: trimmedTitle,
      summary: nextSummary,
    };

    try {
      await queueEntryUpdate(payload);
      baselineRef.current = { title: trimmedTitle, summary: nextSummary };

      if (!isOnline) {
        setState({ status: "queued", errorMessage: null });
        return;
      }

      const savedEntry = await updateEntryMutation.mutateAsync(payload);
      if (version === saveVersionRef.current) {
        await removePendingEntryUpdate(entryId);
        const listQuery = entriesQueries.all();
        queryClient.setQueryData<Entry[] | undefined>(
          listQuery.queryKey,
          (current) => {
            if (!current) {
              return current;
            }
            const next = current.map((entry) =>
              entry.id === savedEntry.id ? savedEntry : entry,
            );
            return [...next].sort(compareEntriesByPinnedDate);
          },
        );
        const byIdQuery = entriesQueries.byId(savedEntry.id);
        queryClient.setQueryData<Entry>(byIdQuery.queryKey, savedEntry);
        setState({ status: "idle", errorMessage: null });
      }
    } catch (error) {
      if (version !== saveVersionRef.current) {
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : "Saved locally, couldn’t sync yet.";
      setState({ status: "error", errorMessage: message });
    }
  },
  [
    entryId,
    isOnline,
    queryClient,
    queueEntryUpdate,
    removePendingEntryUpdate,
    updateEntryMutation,
  ],
  );

  useEffect(() => {
    if (!enabled || !entryId || isBlocked) {
      return;
    }

    const trimmedTitle = title.trim();
    const baseline = baselineRef.current;
    const isDirty =
      trimmedTitle !== baseline.title || summary !== baseline.summary;

    if (!isDirty) {
      if (state.status !== "idle") {
        setState({ status: "idle", errorMessage: null });
      }
      return;
    }

    setState((current) => ({
      status: current.status === "saving" ? current.status : "dirty",
      errorMessage: current.errorMessage,
    }));

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      void saveNow(trimmedTitle, summary);
    }, debounceMs);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [
    debounceMs,
    enabled,
    entryId,
    isBlocked,
    saveNow,
    state.status,
    summary,
    title,
  ]);

  return {
    status: state.status,
    errorMessage: state.errorMessage,
    reset,
    isSaving: updateEntryMutation.isPending,
  };
}
