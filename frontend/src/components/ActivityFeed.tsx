import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, SaveOff, X } from "lucide-react";
import useLocalStorageState from "use-local-storage-state";

import type { ActivityItem } from "@/lib/types/entries";
import { useDebouncedAutosave } from "@/hooks/useDebouncedAutosave";
import { useEntryEditing } from "@/hooks/useEntryEditing";
import { useSync } from "@/hooks/useSync";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LinkYouTubeAccountCard } from "@/components/LinkYouTubeAccountCard";
import { ActivityFeedItem } from "./ActivityFeedItem";
import { ActivityDraftCard } from "./ActivityDraftCard";
import { SmartEntryDraftCard } from "./SmartEntryDraftCard";
import { TodayChecklistEditor } from "@/components/TodayChecklistEditor";
import { isActivityEditable } from "@/lib/activity-helpers";
import { filterActivityItems } from "@/lib/activity-search";
import { deriveSaveIndicator } from "@/lib/journal-detail-logic";
import { buildEntryReferenceTitleMap } from "@/lib/entry-references";
import {
  isTodayEntryForCurrentUtcDay,
  normalizeTodayChecklistMarkdown,
} from "@/lib/today-entry";

export type { ActivityItem };

export type EntryDraftMode = "standard" | "smart";

export interface ActivityDraft {
  title: string;
  summary: string;
  date: string; // datetime-local string
  promptBody?: string;
  promptFormat?: string;
  mode: EntryDraftMode;
}

interface ActivityFeedProps {
  items: ActivityItem[];
  isLinked?: boolean;
  todayEntriesEnabled?: boolean;
  todayMoveCompletedToEnd?: boolean;
  youtubeError?: string | null;
  draft?: ActivityDraft | null;
  onStartDraft?: (mode: EntryDraftMode) => void;
  onDraftChange?: (draft: ActivityDraft) => void;
  onCancelDraft?: () => void;
  onSubmitDraft?: () => void;
  isSubmittingDraft?: boolean;
  draftError?: string | null;
  errorMessage?: string | null;
  conversationErrorMessage?: string | null;
  onConversationClick?: (conversationId: string) => Promise<void>;
  onConversationDelete?: (conversationId: string) => Promise<void>;
  deletingConversationIds?: Set<string>;
  searchQuery: string;
  tagFilter?: string | null;
  tagFilters?: string[];
  className?: string;
}

export function ActivityFeed({
  items,
  isLinked = false,
  todayEntriesEnabled = true,
  todayMoveCompletedToEnd = true,
  youtubeError,
  draft,
  onStartDraft,
  onDraftChange,
  onCancelDraft,
  onSubmitDraft,
  isSubmittingDraft,
  draftError,
  errorMessage,
  conversationErrorMessage,
  onConversationClick,
  onConversationDelete,
  deletingConversationIds,
  searchQuery,
  tagFilter,
  tagFilters,
  className,
}: ActivityFeedProps) {
  const editingState = useEntryEditing();
  const { pendingEntries, pendingEntryUpdates } = useSync();
  const { togglePin, isPinning } = editingState;
  const {
    editingEntryId,
    editingDraft,
    handleEditDraftChange,
    cancelEdit,
    submitEdit,
    isUpdating,
    editingError,
    deleteEntry,
    isDeleting,
    startEdit,
    toggleArchive,
    isArchiving,
  } = editingState;
  const [showTodaySection, setShowTodaySection] = useLocalStorageState<boolean>(
    "showTodayInActivityFeed",
    {
      defaultValue: true,
    },
  );
  const todayEntry = useMemo(
    () =>
      items.find(
        (item) =>
          item.category === "today" && isTodayEntryForCurrentUtcDay(item.id),
      ) ?? null,
    [items],
  );
  const [todaySummaryDraft, setTodaySummaryDraft] = useState("- [ ]");
  const lastSyncedTodayEntryIdRef = useRef<string | null>(null);
  const lastSyncedTodaySummaryRef = useRef<string>("- [ ]");
  const {
    reset: resetTodayAutosave,
    status: todayAutosaveStatus,
    errorMessage: todayAutosaveError,
  } = useDebouncedAutosave({
    entryId: todayEntry?.id ?? null,
    title: todayEntry?.title ?? "Today",
    summary: todaySummaryDraft,
    enabled: Boolean(todayEntriesEnabled && todayEntry),
    debounceMs: 1000,
  });

  // Create a set of pending entry IDs for O(1) lookup
  const pendingEntryIds = useMemo(
    () =>
      new Set([
        ...pendingEntries.map((entry) => entry.id),
        ...pendingEntryUpdates.map((update) => update.id),
      ]),
    [pendingEntries, pendingEntryUpdates],
  );

  useEffect(() => {
    if (!todayEntry) {
      lastSyncedTodayEntryIdRef.current = null;
      lastSyncedTodaySummaryRef.current = "- [ ]";
      return;
    }
    let normalizedSummary = "- [ ]";
    try {
      normalizedSummary = normalizeTodayChecklistMarkdown(todayEntry.summary);
    } catch {
      normalizedSummary = "- [ ]";
    }

    const isDifferentEntry = lastSyncedTodayEntryIdRef.current !== todayEntry.id;
    if (isDifferentEntry) {
      lastSyncedTodayEntryIdRef.current = todayEntry.id;
      lastSyncedTodaySummaryRef.current = normalizedSummary;
      setTodaySummaryDraft(normalizedSummary);
      resetTodayAutosave(todayEntry.title, normalizedSummary);
      return;
    }

    const isServerSummaryChanged =
      normalizedSummary !== lastSyncedTodaySummaryRef.current;
    if (!isServerSummaryChanged) {
      return;
    }

    lastSyncedTodaySummaryRef.current = normalizedSummary;

    if (
      todayAutosaveStatus === "dirty" ||
      todayAutosaveStatus === "saving" ||
      todayAutosaveStatus === "queued"
    ) {
      return;
    }

    if (todaySummaryDraft !== normalizedSummary) {
      setTodaySummaryDraft(normalizedSummary);
      resetTodayAutosave(todayEntry.title, normalizedSummary);
    }
  }, [
    resetTodayAutosave,
    todayAutosaveStatus,
    todayEntry,
    todaySummaryDraft,
  ]);

  const itemsForFeed = useMemo(() => {
    if (!todayEntriesEnabled || !showTodaySection || !todayEntry) {
      return items;
    }
    return items.filter((item) => item.id !== todayEntry.id);
  }, [items, showTodaySection, todayEntriesEnabled, todayEntry]);

  const filteredItems = useMemo(
    () =>
      filterActivityItems(itemsForFeed, searchQuery, {
        tag: tagFilter,
        tags: tagFilters,
      }),
    [itemsForFeed, searchQuery, tagFilter, tagFilters],
  );
  const entryReferenceTitles = useMemo(
    () =>
      buildEntryReferenceTitleMap(
        items
          .filter((item) => item.category === "journal")
          .map((item) => ({ id: item.id, title: item.title })),
      ),
    [items],
  );
  const todayHasPendingUpdate = Boolean(
    todayEntry && pendingEntryIds.has(todayEntry.id),
  );
  const todaySaveIndicator = useMemo(
    () =>
      deriveSaveIndicator(
        todayAutosaveStatus,
        todayAutosaveError,
        todayHasPendingUpdate,
      ),
    [todayAutosaveError, todayAutosaveStatus, todayHasPendingUpdate],
  );
  const renderedFeedItems = useMemo(
    () =>
      filteredItems.map((item) => {
        const isEditing = editingEntryId === item.id && editingDraft;
        const isEditable = isActivityEditable(item);
        const isConversation = item.category === "conversation";
        const isConversationDeleting = Boolean(
          isConversation && deletingConversationIds?.has(item.id),
        );

        if (isEditing && editingDraft) {
          return (
            <ActivityDraftCard
              key={item.id}
              draft={editingDraft}
              onChange={handleEditDraftChange}
              onCancel={cancelEdit}
              onSubmit={() => {
                void submitEdit();
              }}
              isSubmitting={isUpdating}
              errorMessage={editingError}
              submitLabel="Save changes"
              category={item.category}
              idPrefix={`edit-entry-${item.id}`}
              onDelete={
                isEditable
                  ? () => {
                      void deleteEntry(item.id);
                    }
                  : undefined
              }
              isDeleting={isDeleting(item.id)}
            />
          );
        }

        return (
          <ActivityFeedItem
            key={item.id}
            item={item}
            entryReferenceTitles={entryReferenceTitles}
            isPendingSync={pendingEntryIds.has(item.id)}
            onConversationClick={onConversationClick}
            onConversationDelete={
              isConversation && onConversationDelete
                ? () => {
                    void onConversationDelete(item.id);
                  }
                : undefined
            }
            isConversationDeleting={isConversationDeleting}
            onEdit={
              isEditable
                ? () => {
                    startEdit(item);
                  }
                : undefined
            }
            onDelete={
              isEditable
                ? () => {
                    void deleteEntry(item.id);
                  }
                : undefined
            }
            isDeleting={isDeleting(item.id)}
            onPinToggle={
              isEditable && item.category === "journal"
                ? () => {
                    void togglePin(item.id, !item.pinned);
                  }
                : undefined
            }
            isPinning={
              isEditable && item.category === "journal"
                ? isPinning(item.id)
                : false
            }
            onArchiveToggle={
              isEditable && item.category === "journal"
                ? () => {
                    void toggleArchive(item.id, !item.archived);
                  }
                : undefined
            }
            isArchiving={
              isEditable && item.category === "journal"
                ? isArchiving(item.id)
                : false
            }
          />
        );
      }),
    [
      filteredItems,
      editingEntryId,
      editingDraft,
      deletingConversationIds,
      handleEditDraftChange,
      cancelEdit,
      submitEdit,
      isUpdating,
      editingError,
      deleteEntry,
      isDeleting,
      onConversationClick,
      onConversationDelete,
      startEdit,
      pendingEntryIds,
      entryReferenceTitles,
      togglePin,
      isPinning,
      toggleArchive,
      isArchiving,
    ],
  );
  const [isMobileCreateOpen, setIsMobileCreateOpen] = useState(false);
  const canStartDraft = !draft;
  const createDraftRef = useRef<HTMLDivElement | null>(null);
  const hasScrolledToDraftRef = useRef(false);

  const startDraft = (mode: EntryDraftMode) => {
    onStartDraft?.(mode);
    setIsMobileCreateOpen(false);
  };

  useEffect(() => {
    if (canStartDraft) {
      return;
    }
    setIsMobileCreateOpen(false);
  }, [canStartDraft]);

  useEffect(() => {
    if (!draft) {
      hasScrolledToDraftRef.current = false;
      return;
    }
    if (hasScrolledToDraftRef.current) {
      return;
    }
    hasScrolledToDraftRef.current = true;
    requestAnimationFrame(() => {
      createDraftRef.current?.scrollIntoView?.({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
      });
    });
  }, [draft]);

  return (
    <Card
      className={cn(
        "flex h-full min-h-0 flex-col rounded-none border-0 shadow-none sm:rounded-xl sm:border sm:shadow",
        className,
      )}
    >
      <CardHeader className="flex w-full flex-row items-center justify-between gap-2 space-y-0 px-4 pb-3 pt-1 sm:p-6">
        <div className="flex items-center gap-2">
          {todayEntriesEnabled ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowTodaySection((current) => !current)}
            >
              {showTodaySection ? "Hide Today" : "Show Today"}
            </Button>
          ) : null}
        </div>
        <div className="hidden flex-wrap items-center justify-end gap-2 sm:flex">
          <Button
            type="button"
            variant="outline"
            onClick={() => startDraft("smart")}
            disabled={Boolean(draft)}
            className="self-start sm:self-auto"
          >
            + smart entry
          </Button>
          <Button
            type="button"
            onClick={() => startDraft("standard")}
            disabled={Boolean(draft)}
            className="self-start sm:self-auto"
          >
            + entry
          </Button>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-0 sm:px-6 sm:pr-2">
        {errorMessage ? (
          <p className="text-sm text-destructive" role="status">
            {errorMessage}
          </p>
        ) : null}
        {conversationErrorMessage ? (
          <p className="text-sm text-destructive" role="status">
            {conversationErrorMessage}
          </p>
        ) : null}
        {!isLinked ? <LinkYouTubeAccountCard /> : null}
        {youtubeError ? (
          <p className="text-sm text-destructive" role="status">
            {youtubeError}
          </p>
        ) : null}
        {draft && onDraftChange ? (
          <div ref={createDraftRef} className="scroll-mt-2 sm:scroll-mt-4">
            {draft.mode === "smart" ? (
              <SmartEntryDraftCard
                draft={draft}
                onChange={onDraftChange}
                onCancel={onCancelDraft}
                onSubmit={onSubmitDraft}
                isSubmitting={isSubmittingDraft}
                errorMessage={draftError}
                submitLabel="Create smart entry"
                idPrefix="new-smart-entry"
              />
            ) : (
              <ActivityDraftCard
                draft={draft}
                onChange={onDraftChange}
                onCancel={onCancelDraft}
                onSubmit={onSubmitDraft}
                isSubmitting={isSubmittingDraft}
                errorMessage={draftError}
                submitLabel="Create entry"
                category="journal"
                idPrefix="new-entry"
              />
            )}
          </div>
        ) : null}
        {todayEntriesEnabled && showTodaySection ? (
          <div className="space-y-2 rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-primary/10 text-primary">
                today
              </Badge>
              {todaySaveIndicator.show ? (
                <span
                  className={cn(
                    "inline-flex h-5 w-5 items-center justify-center rounded-md border border-current/25",
                    todaySaveIndicator.tone,
                  )}
                  title={todaySaveIndicator.message}
                  aria-label={todaySaveIndicator.message}
                >
                  <SaveOff
                    className={cn(
                      "h-3 w-3",
                      todaySaveIndicator.isSaving && "animate-bounce",
                    )}
                  />
                </span>
              ) : null}
            </div>
            {todayEntry ? (
              <>
                <TodayChecklistEditor
                  value={todaySummaryDraft}
                  onChange={setTodaySummaryDraft}
                  moveCompletedTasksToEnd={todayMoveCompletedToEnd}
                />
                {todayAutosaveError ? (
                  <p className="text-xs text-destructive">{todayAutosaveError}</p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Today entry will appear shortly.
              </p>
            )}
          </div>
        ) : null}
        {filteredItems.length === 0 && searchQuery ? (
          <p className="text-sm text-muted-foreground" role="status">
            No activity matches “{searchQuery}”.
          </p>
        ) : null}
        {renderedFeedItems}
      </CardContent>
      <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 sm:hidden">
        {isMobileCreateOpen ? (
          <div className="flex flex-col items-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => startDraft("smart")}
              disabled={!canStartDraft}
              className="h-10 rounded-md px-4"
            >
              + smart entry
            </Button>
            <Button
              type="button"
              onClick={() => startDraft("standard")}
              disabled={!canStartDraft}
              className="h-10 rounded-md px-4"
            >
              + entry
            </Button>
          </div>
        ) : null}
        <Button
          type="button"
          size="icon"
          aria-expanded={isMobileCreateOpen}
          aria-label={isMobileCreateOpen ? "Close create menu" : "Open create menu"}
          onClick={() => setIsMobileCreateOpen((current) => !current)}
          disabled={!canStartDraft}
          className="h-14 w-14 rounded-2xl shadow-lg"
        >
          {isMobileCreateOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <Plus className="h-6 w-6" />
          )}
        </Button>
      </div>
    </Card>
  );
}
