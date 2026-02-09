import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import type { ActivityItem } from "@/lib/types/entries";
import type {
  YoutubeFeedResponse,
  YoutubeLinkStatusResponse,
} from "@/api/youtube";
import { useEntryEditing } from "@/hooks/useEntryEditing";
import { useSync } from "@/hooks/useSync";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LinkYouTubeAccountCard } from "@/components/LinkYouTubeAccountCard";
import { ActivityFeedItem } from "./ActivityFeedItem";
import { ActivityDraftCard } from "./ActivityDraftCard";
import { SmartEntryDraftCard } from "./SmartEntryDraftCard";
import { InfoModal } from "./InfoModal";
import { ActivityFeedInfo } from "./ActivityFeedInfo";
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
  youtubeFeed?: YoutubeFeedResponse | null;
  isLinked?: boolean;
  linkStatus?: YoutubeLinkStatusResponse | null;
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
  youtubeFeed,
  isLinked = false,
  linkStatus,
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
  const [thumbnailError, setThumbnailError] = useState(false);

  const shouldShowChannelBanner =
    channelProfileQuery.isSuccess && !channelProfileQuery.data?.profile;

  // Create a set of pending entry IDs for O(1) lookup
  const pendingEntryIds = useMemo(
    () => new Set(pendingEntries.map((e) => e.id)),
    [pendingEntries],
  );

  const channelThumbnailUrl = youtubeFeed?.channelThumbnailUrl?.trim() ?? null;
  const isValidUrl =
    channelThumbnailUrl &&
    (channelThumbnailUrl.startsWith("http://") ||
      channelThumbnailUrl.startsWith("https://"));
  const shouldShowThumbnail =
    isValidUrl && channelThumbnailUrl.length > 0 && !thumbnailError;

  // Reset thumbnail error when the URL changes
  useEffect(() => {
    setThumbnailError(false);
  }, [channelThumbnailUrl]);

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
      <CardHeader className="flex flex-row justify-between gap-4 p-4 sm:flex-row sm:items-start sm:p-6">
        <div className="flex items-start gap-3">
          {shouldShowThumbnail ? (
            <img
              src={channelThumbnailUrl}
              alt={`${youtubeFeed?.channelTitle ?? "YouTube"} channel thumbnail`}
              className="h-12 w-12 shrink-0 rounded-full"
              loading="lazy"
              onError={() => setThumbnailError(true)}
            />
          ) : null}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">Recent Activity</CardTitle>
              <InfoModal
                title="About the Activity Feed"
                description="Learn how to use the activity feed for journaling"
                triggerLabel="Learn more about the activity feed"
              >
                <ActivityFeedInfo />
              </InfoModal>
            </div>
            {youtubeFeed?.channelUrl ? (
              <a
                href={youtubeFeed.channelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                View {youtubeFeed?.channelTitle ?? "YouTube"} on YouTube
              </a>
            ) : linkStatus?.channel?.url ? (
              <a
                href={linkStatus.channel.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                View {linkStatus.channel.title ?? "YouTube"} on YouTube
              </a>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
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
