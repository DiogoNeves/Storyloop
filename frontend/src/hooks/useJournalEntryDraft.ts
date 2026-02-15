import { useCallback, useEffect, useRef, useState } from "react";

import { useDebouncedAutosave } from "@/hooks/useDebouncedAutosave";
import type { Entry } from "@/api/entries";
import { isEffectivelyEmptyNoteContent } from "@/lib/journal-detail-logic";

interface UseJournalEntryDraftOptions {
  currentEntry: Entry | null;
  isNewEntryRoute: boolean;
  isSmartEntry: boolean;
  isSmartUpdating: boolean;
}

export function useJournalEntryDraft({
  currentEntry,
  isNewEntryRoute,
  isSmartEntry,
  isSmartUpdating,
}: UseJournalEntryDraftOptions) {
  const [titleDraft, setTitleDraft] = useState("");
  const [summaryDraft, setSummaryDraftState] = useState("");
  const [editorInitialSummary, setEditorInitialSummary] = useState("");
  const [editorResetNonce, setEditorResetNonce] = useState(0);

  const autosave = useDebouncedAutosave({
    entryId: currentEntry?.id ?? null,
    title: titleDraft,
    summary: summaryDraft,
    enabled: Boolean(currentEntry) && !isNewEntryRoute,
    isBlocked: isSmartUpdating,
    debounceMs: 1000,
  });
  const {
    reset: resetAutosave,
    status: autosaveStatus,
    errorMessage: autosaveError,
  } = autosave;

  const lastEntryIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isNewEntryRoute) {
      setTitleDraft("");
      setSummaryDraftState("");
      setEditorInitialSummary("");
      setEditorResetNonce(0);
      lastEntryIdRef.current = null;
      resetAutosave("", "");
      return;
    }

    if (!currentEntry) {
      return;
    }

    if (lastEntryIdRef.current !== currentEntry.id) {
      lastEntryIdRef.current = currentEntry.id;
      const nextTitle = currentEntry.title ?? "";
      const nextSummary = normalizeSummaryDraft(currentEntry.summary);
      setTitleDraft(nextTitle);
      setSummaryDraftState(nextSummary);
      setEditorInitialSummary(nextSummary);
      setEditorResetNonce(0);
      resetAutosave(nextTitle, nextSummary);
    }
  }, [
    currentEntry,
    currentEntry?.id,
    currentEntry?.summary,
    currentEntry?.title,
    isNewEntryRoute,
    resetAutosave,
  ]);

  useEffect(() => {
    if (!currentEntry || !isSmartEntry || isSmartUpdating) {
      return;
    }
    if (autosaveStatus !== "idle") {
      return;
    }
    const nextSummary = normalizeSummaryDraft(currentEntry.summary);
    if (summaryDraft === nextSummary) {
      return;
    }
    setSummaryDraftState(nextSummary);
    setEditorInitialSummary(nextSummary);
    resetAutosave(titleDraft, nextSummary);
  }, [
    autosaveStatus,
    currentEntry,
    isSmartEntry,
    isSmartUpdating,
    resetAutosave,
    summaryDraft,
    titleDraft,
  ]);

  const applyDictatedSummary = useCallback((nextSummary: string) => {
    const normalizedSummary = normalizeSummaryDraft(nextSummary);
    setSummaryDraftState(normalizedSummary);
    setEditorInitialSummary(normalizedSummary);
    setEditorResetNonce((current) => current + 1);
  }, []);

  const setSummaryDraft = useCallback((nextSummary: string) => {
    setSummaryDraftState(normalizeSummaryDraft(nextSummary));
  }, []);

  return {
    titleDraft,
    summaryDraft,
    setTitleDraft,
    setSummaryDraft,
    editorInitialSummary,
    editorResetNonce,
    applyDictatedSummary,
    autosaveStatus,
    autosaveError,
  };
}

function normalizeSummaryDraft(value: string | null | undefined): string {
  if (isEffectivelyEmptyNoteContent(value)) {
    return "";
  }

  return value ?? "";
}
