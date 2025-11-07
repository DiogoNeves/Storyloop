import { useMemo, useState, useEffect } from "react";

import {
  type ActivityItem,
  youtubeVideoToActivityItem,
} from "@/lib/types/entries";
import { useYouTubeFeed } from "@/hooks/useYouTubeFeed";
import { useEntryEditing } from "@/hooks/useEntryEditing";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActivityFeedItem } from "./ActivityFeedItem";
import { ActivityDraftCard } from "./ActivityDraftCard";
import { YouTubeLinkCard } from "./YouTubeLinkCard";
import { youtubeAuthApi } from "@/api/youtubeAuth";

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
  const [isLinked, setIsLinked] = useState<boolean | null>(null);

  // Check linked status on mount and when component updates
  useEffect(() => {
    void checkLinkedStatus();
  }, []);

  const checkLinkedStatus = async () => {
    try {
      const status = await youtubeAuthApi.getYoutubeAuthStatus();
      setIsLinked(status.linked);
    } catch {
      // If check fails, assume not linked
      setIsLinked(false);
    }
  };

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

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-lg">Recent activity</CardTitle>
          <CardDescription>
            A combined stream of publishing milestones, insights, and journal
            reflections.
          </CardDescription>
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
        {isLinked === false ? (
          <YouTubeLinkCard
            onLinked={() => {
              void checkLinkedStatus();
            }}
          />
        ) : isLinked === true ? (
          <Card className="border-dashed border-primary/40 bg-primary/5">
            <CardContent className="space-y-3 p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">
                  Preview another YouTube channel
                </h3>
                <p className="text-xs text-muted-foreground">
                  Paste a handle, channel URL, or ID to preview recent uploads.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={youtubeState.channelInput}
                  onChange={(event) =>
                    youtubeState.setChannelInput(event.target.value)
                  }
                  onKeyDown={youtubeState.handleChannelKeyDown}
                  placeholder="e.g. @Storyloop or youtube.com/@Storyloop"
                  aria-label="YouTube channel"
                />
                <Button
                  type="button"
                  onClick={() => {
                    void youtubeState.handleFetchVideos();
                  }}
                  disabled={youtubeState.isLoadingVideos}
                  className="shrink-0"
                >
                  {youtubeState.isLoadingVideos ? "Loading…" : "Load videos"}
                </Button>
              </div>
              {youtubeState.youtubeFeed ? (
                <p className="text-xs text-muted-foreground">
                  Showing {youtubeState.youtubeFeed.videos.length} recent video
                  {youtubeState.youtubeFeed.videos.length === 1 ? "" : "s"} from
                  <a
                    href={youtubeState.youtubeFeed.channelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {youtubeState.youtubeFeed.channelTitle}
                  </a>
                  .
                </p>
              ) : null}
              {youtubeState.youtubeError ? (
                <p className="text-sm text-destructive" role="status">
                  {youtubeState.youtubeError}
                </p>
              ) : null}
            </CardContent>
          </Card>
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
