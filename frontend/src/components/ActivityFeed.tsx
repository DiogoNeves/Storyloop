import { useMemo, useState, useEffect } from "react";

import {
  type ActivityItem,
  youtubeVideoToActivityItem,
} from "@/lib/types/entries";
import { useYouTubeFeed } from "@/hooks/useYouTubeFeed";
import { useEntryEditing } from "@/hooks/useEntryEditing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LinkYouTubeAccountCard } from "@/components/LinkYouTubeAccountCard";
import { ActivityFeedItem } from "./ActivityFeedItem";
import { ActivityDraftCard } from "./ActivityDraftCard";
import { InfoModal } from "./InfoModal";
import { ActivityFeedInfo } from "./ActivityFeedInfo";

export type { ActivityItem };

export interface ActivityDraft {
  title: string;
  summary: string;
  date: string; // datetime-local string
  videoId: string;
}

interface ActivityFeedProps {
  items: ActivityItem[];
  draft?: ActivityDraft | null;
  onStartDraft?: () => void;
  onDraftChange?: (draft: ActivityDraft) => void;
  onCancelDraft?: () => void;
  onSubmitDraft?: () => void;
  isSubmittingDraft?: boolean;
  draftError?: string | null;
  errorMessage?: string | null;
}

export function ActivityFeed({
  items,
  draft,
  onStartDraft,
  onDraftChange,
  onCancelDraft,
  onSubmitDraft,
  isSubmittingDraft,
  draftError,
  errorMessage,
}: ActivityFeedProps) {
  const youtubeState = useYouTubeFeed();
  const editingState = useEntryEditing();
  const [thumbnailError, setThumbnailError] = useState(false);

  const combinedItems = useMemo(() => {
    const baseItems = [...items];
    if (!youtubeState.youtubeFeed) {
      return baseItems.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
    }

    const videoItems = youtubeState.youtubeFeed.videos.map(
      youtubeVideoToActivityItem,
    );

    return [...baseItems, ...videoItems].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [items, youtubeState.youtubeFeed]);

  const channelThumbnailUrl =
    youtubeState.youtubeFeed?.channelThumbnailUrl?.trim() || null;
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

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          {shouldShowThumbnail ? (
            <img
              src={channelThumbnailUrl}
              alt={`${youtubeState.youtubeFeed?.channelTitle ?? "YouTube"} channel thumbnail`}
              className="h-12 w-12 shrink-0 rounded-full"
              loading="lazy"
              onError={() => setThumbnailError(true)}
            />
          ) : null}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">Recent activity</CardTitle>
              <InfoModal
                title="About the Activity Feed"
                description="Learn how to use the activity feed for journaling"
                triggerLabel="Learn more about the activity feed"
              >
                <ActivityFeedInfo />
              </InfoModal>
            </div>
            {youtubeState.youtubeFeed?.channelUrl ? (
              <a
                href={youtubeState.youtubeFeed.channelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                View {youtubeState.youtubeFeed?.channelTitle ?? "YouTube"} on
                YouTube
              </a>
            ) : youtubeState.linkStatus?.channel?.url ? (
              <a
                href={youtubeState.linkStatus.channel.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                View {youtubeState.linkStatus.channel.title ?? "YouTube"} on
                YouTube
              </a>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          onClick={onStartDraft}
          disabled={Boolean(draft)}
          className="self-start sm:ml-auto sm:self-end"
        >
          + entry
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorMessage ? (
          <p className="text-sm text-destructive" role="status">
            {errorMessage}
          </p>
        ) : null}
        {!youtubeState.isLinked ? <LinkYouTubeAccountCard /> : null}
        {youtubeState.youtubeError ? (
          <p className="text-sm text-destructive" role="status">
            {youtubeState.youtubeError}
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
        {combinedItems.map((item) => {
          const isEditing =
            editingState.editingEntryId === item.id &&
            editingState.editingDraft;
          const isEditable =
            item.category !== "content" && !item.id.startsWith("youtube:");
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
