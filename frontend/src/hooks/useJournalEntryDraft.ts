import { useEffect, useRef, useState } from "react";

import { useDebouncedAutosave } from "@/hooks/useDebouncedAutosave";
import type { Entry } from "@/api/entries";

type UseJournalEntryDraftOptions = {
  currentEntry: Entry | null;
  isNewEntryRoute: boolean;
  isSmartEntry: boolean;
  isSmartUpdating: boolean;
};

export function useJournalEntryDraft({
  currentEntry,
  isNewEntryRoute,
  isSmartEntry,
  isSmartUpdating,
}: UseJournalEntryDraftOptions) {
  const [titleDraft, setTitleDraft] = useState("");
  const [summaryDraft, setSummaryDraft] = useState("");
  const [editorInitialSummary, setEditorInitialSummary] = useState("");

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
      setSummaryDraft("");
      setEditorInitialSummary("");
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
      const nextSummary = currentEntry.summary ?? "";
      setTitleDraft(nextTitle);
      setSummaryDraft(nextSummary);
      setEditorInitialSummary(nextSummary);
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
    const nextSummary = currentEntry.summary ?? "";
    if (summaryDraft === nextSummary) {
      return;
    }
    setSummaryDraft(nextSummary);
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

  return {
    titleDraft,
    setTitleDraft,
    setSummaryDraft,
    editorInitialSummary,
    autosaveStatus,
    autosaveError,
  };
}
