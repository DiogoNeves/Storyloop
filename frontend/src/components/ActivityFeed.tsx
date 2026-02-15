import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import type { ActivityItem } from "@/lib/types/entries";
import { useEntryEditing } from "@/hooks/useEntryEditing";
import { useSync } from "@/hooks/useSync";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LinkYouTubeAccountCard } from "@/components/LinkYouTubeAccountCard";
import { ActivityFeedItem } from "./ActivityFeedItem";
import { ActivityDraftCard } from "./ActivityDraftCard";
import { SmartEntryDraftCard } from "./SmartEntryDraftCard";
import { isActivityEditable } from "@/lib/activity-helpers";
import { filterActivityItems } from "@/lib/activity-search";
import { channelQueries } from "@/api/channel";

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
  className?: string;
}

export function ActivityFeed({
  items,
  isLinked = false,
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
  className,
}: ActivityFeedProps) {
  const editingState = useEntryEditing();
  const { pendingEntries } = useSync();
  const channelProfileQuery = useQuery(channelQueries.profile());
  const { togglePin, isPinning } = editingState;

  const shouldShowChannelBanner =
    channelProfileQuery.isSuccess && !channelProfileQuery.data?.profile;

  // Create a set of pending entry IDs for O(1) lookup
  const pendingEntryIds = useMemo(
    () => new Set(pendingEntries.map((e) => e.id)),
    [pendingEntries],
  );

  const filteredItems = useMemo(
    () => filterActivityItems(items, searchQuery, { tag: tagFilter }),
    [items, searchQuery, tagFilter],
  );

  return (
    <Card
      className={cn(
        "flex h-full min-h-0 flex-col rounded-none border-0 shadow-none sm:rounded-xl sm:border sm:shadow",
        className,
      )}
    >
      <CardHeader className="flex w-full flex-row items-center justify-end gap-2 space-y-0 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
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
