import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
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
import { channelQueries } from "@/api/channel";
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
  const { pendingEntries } = useSync();
  const channelProfileQuery = useQuery(channelQueries.profile());
  const { togglePin, isPinning } = editingState;
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
  const {
    reset: resetTodayAutosave,
    status: todayAutosaveStatus,
    errorMessage: todayAutosaveError,
  } = useDebouncedAutosave({
    entryId: todayEntry?.id ?? null,
    title: todayEntry?.title ?? "Today",
    summary: todaySummaryDraft,
    enabled: Boolean(todayEntriesEnabled && todayEntry),
    debounceMs: 400,
  });

  const shouldShowChannelBanner =
    channelProfileQuery.isSuccess && !channelProfileQuery.data?.profile;

  // Create a set of pending entry IDs for O(1) lookup
  const pendingEntryIds = useMemo(
    () => new Set(pendingEntries.map((e) => e.id)),
    [pendingEntries],
  );

  useEffect(() => {
    if (!todayEntry) {
      lastSyncedTodayEntryIdRef.current = null;
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
      setTodaySummaryDraft(normalizedSummary);
      resetTodayAutosave(todayEntry.title, normalizedSummary);
      return;
    }

    if (todayAutosaveStatus === "dirty" || todayAutosaveStatus === "saving") {
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onStartDraft?.("smart")}
            disabled={Boolean(draft)}
            className="self-start sm:self-auto"
          >
            + smart entry
          </Button>
          <Button
            type="button"
            onClick={() => onStartDraft?.("standard")}
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
        {shouldShowChannelBanner ? (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold">
                Define your channel identity
              </p>
              <p className="text-sm text-muted-foreground">
                Complete the Channel profile so Loopie can evaluate ideas
                against your target audiences.
              </p>
            </div>
            <Button type="button" variant="secondary" asChild>
              <Link to="/channel">Fill in Channel</Link>
            </Button>
          </div>
        ) : null}
        {todayEntriesEnabled && showTodaySection ? (
          <div className="space-y-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-primary/10 text-primary">
                today
              </Badge>
            </div>
            {todayEntry ? (
              <>
                <TodayChecklistEditor
                  value={todaySummaryDraft}
                  onChange={setTodaySummaryDraft}
                />
                {todayAutosaveStatus !== "idle" ? (
                  <p className="text-xs text-muted-foreground">
                    {todayAutosaveStatus === "saving"
                      ? "Saving Today…"
                      : todayAutosaveStatus === "queued"
                        ? "Saved locally, will sync when online."
                        : todayAutosaveStatus === "dirty"
                          ? "Editing…"
                          : "Couldn’t sync Today yet."}
                  </p>
                ) : null}
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
        {draft && onDraftChange ? (
          draft.mode === "smart" ? (
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
          )
        ) : null}
        {filteredItems.length === 0 && searchQuery ? (
          <p className="text-sm text-muted-foreground" role="status">
            No activity matches “{searchQuery}”.
          </p>
        ) : null}
        {filteredItems.map((item) => {
          const isEditing =
            editingState.editingEntryId === item.id &&
            editingState.editingDraft;
          const isEditable = isActivityEditable(item);
          const isConversation = item.category === "conversation";
          const isConversationDeleting = Boolean(
            isConversation && deletingConversationIds?.has(item.id),
          );

          if (isEditing && editingState.editingDraft) {
            return (
              <ActivityDraftCard
                key={item.id}
                draft={editingState.editingDraft}
                onChange={editingState.handleEditDraftChange}
                onCancel={editingState.cancelEdit}
                onSubmit={() => {
                  void editingState.submitEdit();
                }}
                isSubmitting={editingState.isUpdating}
                errorMessage={editingState.editingError}
                submitLabel="Save changes"
                category={item.category}
                idPrefix={`edit-entry-${item.id}`}
                onDelete={
                  isEditable
                    ? () => {
                        void editingState.deleteEntry(item.id);
                      }
                    : undefined
                }
                isDeleting={editingState.isDeleting(item.id)}
              />
            );
          }

          return (
            <ActivityFeedItem
              key={item.id}
              item={item}
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
                      editingState.startEdit(item);
                    }
                  : undefined
              }
              onDelete={
                isEditable
                  ? () => {
                      void editingState.deleteEntry(item.id);
                    }
                  : undefined
              }
              isDeleting={editingState.isDeleting(item.id)}
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
                      void editingState.toggleArchive(item.id, !item.archived);
                    }
                  : undefined
              }
              isArchiving={
                isEditable && item.category === "journal"
                  ? editingState.isArchiving(item.id)
                  : false
              }
            />
          );
        })}
      </CardContent>
    </Card>
  );
}
