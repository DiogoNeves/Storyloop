import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { entriesMutations, type UpdateEntryInput } from "@/api/entries";
import { type ActivityDraft } from "@/components/ActivityFeed";
import { type ActivityItem } from "@/lib/types/entries";

/**
 * Hook for managing entry editing state and operations.
 * 
 * Encapsulates the state and logic for editing and deleting entries.
 */
export function useEntryEditing() {
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<ActivityDraft | null>(null);
  const [editingError, setEditingError] = useState<string | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  
  const updateEntryMutation = useMutation(
    entriesMutations.update(queryClient, {
      onError: (error) => {
        const message =
          error instanceof Error
            ? error.message
            : "We couldn't update this entry. Please try again.";
        setEditingError(message);
      },
      onSuccess: () => {
        setEditingEntryId(null);
        setEditingDraft(null);
        setEditingError(null);
      },
    }),
  );

  const deleteEntryMutation = useMutation(
    entriesMutations.delete(queryClient, {
      onError: (error) => {
        const message =
          error instanceof Error
            ? error.message
            : "We couldn't delete this entry. Please try again.";
        setEditingError(message);
      },
      onSuccess: (_data, id) => {
        if (editingEntryId === id) {
          setEditingEntryId(null);
          setEditingDraft(null);
        }
      },
      onSettled: () => {
        setDeletingEntryId(null);
      },
    }),
  );

  const startEdit = useCallback((item: ActivityItem) => {
    if (item.category === "content" || item.id.startsWith("youtube:")) {
      return;
    }
    setEditingEntryId(item.id);
    setEditingDraft({
      title: item.title,
      summary: item.summary,
      date: toDateTimeLocalInput(item.date),
    });
    setEditingError(null);
  }, []);

  const handleEditDraftChange = useCallback((draft: ActivityDraft) => {
    setEditingDraft(draft);
    setEditingError(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingEntryId(null);
    setEditingDraft(null);
    setEditingError(null);
  }, []);

  const submitEdit = useCallback(async () => {
    if (!editingEntryId || !editingDraft) {
      return;
    }
    const trimmedTitle = editingDraft.title.trim();
    const trimmedSummary = editingDraft.summary.trim();
    if (trimmedTitle.length === 0) {
      setEditingError("Add a title before saving.");
      return;
    }

    const payload: UpdateEntryInput = {
      id: editingEntryId,
      title: trimmedTitle,
      summary: trimmedSummary,
      date: new Date(editingDraft.date).toISOString(),
    };

    try {
      setEditingError(null);
      await updateEntryMutation.mutateAsync(payload);
    } catch {
      // handled in the mutation onError callback
    }
  }, [editingDraft, editingEntryId, updateEntryMutation]);

  const deleteEntry = useCallback(
    (id: string) => {
      if (deletingEntryId) {
        return;
      }
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(
          "Are you sure you want to delete this entry?",
        );
        if (!confirmed) {
          return;
        }
      }
      setDeletingEntryId(id);
      setEditingError(null);
      void deleteEntryMutation.mutateAsync(id).catch(() => {
        // handled in the mutation onError callback
      });
    },
    [deleteEntryMutation, deletingEntryId],
  );

  return {
    editingEntryId,
    editingDraft,
    editingError,
    deletingEntryId,
    isUpdating: updateEntryMutation.isPending,
    isDeleting: (id: string) => deletingEntryId === id && deleteEntryMutation.isPending,
    startEdit,
    handleEditDraftChange,
    cancelEdit,
    submitEdit,
    deleteEntry,
  };
}

function toDateTimeLocalInput(date: string) {
  const original = new Date(date);
  original.setSeconds(0);
  original.setMilliseconds(0);
  const offset = original.getTimezoneOffset();
  const adjusted = new Date(original.getTime() - offset * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

