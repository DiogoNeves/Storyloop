import { useMemo, useState, useEffect } from "react";

import type { ActivityItem } from "@/lib/types/entries";
import type {
  YoutubeFeedResponse,
  YoutubeLinkStatusResponse,
} from "@/api/youtube";
import { useEntryEditing } from "@/hooks/useEntryEditing";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LinkYouTubeAccountCard } from "@/components/LinkYouTubeAccountCard";
import { ActivityFeedItem } from "./ActivityFeedItem";
import { ActivityDraftCard } from "./ActivityDraftCard";
import { InfoModal } from "./InfoModal";
import { ActivityFeedInfo } from "./ActivityFeedInfo";
import { isActivityEditable } from "@/lib/activity-helpers";
import { filterActivityItems } from "@/lib/activity-search";

export type { ActivityItem };

export interface ActivityDraft {
  title: string;
  summary: string;
  date: string; // datetime-local string
}

interface ActivityFeedProps {
  items: ActivityItem[];
  youtubeFeed?: YoutubeFeedResponse | null;
  isLinked?: boolean;
  linkStatus?: YoutubeLinkStatusResponse | null;
  youtubeError?: string | null;
  draft?: ActivityDraft | null;
  onStartDraft?: () => void;
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
  className,
}: ActivityFeedProps) {
  const editingState = useEntryEditing();
  const [thumbnailError, setThumbnailError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
    () => filterActivityItems(items, searchQuery),
    [items, searchQuery],
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
          <div className="w-full max-w-[220px] sm:max-w-[260px]">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search activity"
              aria-label="Search activity"
            />
          </div>
          <Button
            type="button"
            onClick={onStartDraft}
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
            />
          );
        })}
      </CardContent>
    </Card>
  );
}
