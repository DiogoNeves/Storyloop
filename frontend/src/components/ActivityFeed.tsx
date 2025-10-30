import { useMemo } from "react";

import {
  type ActivityItem,
  youtubeVideoToActivityItem,
} from "@/lib/types/entries";
import { useYouTubeFeed } from "@/hooks/useYouTubeFeed";
import { useEntryEditing } from "@/hooks/useEntryEditing";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
        <Card className="border-dashed border-primary/40 bg-primary/5">
          <CardContent className="space-y-3 p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">
                Connect your YouTube channel
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
            item.category !== "video" && !item.id.startsWith("youtube:");
          if (isEditing && editingState.editingDraft) {
            return (
              <ActivityDraftCard
                key={item.id}
                draft={editingState.editingDraft}
                onChange={editingState.handleEditDraftChange}
                onCancel={editingState.cancelEdit}
                onSubmit={editingState.submitEdit}
                isSubmitting={editingState.isUpdating}
                errorMessage={editingState.editingError}
                submitLabel="Save changes"
                category={item.category}
                idPrefix={`edit-entry-${item.id}`}
                onDelete={
                  isEditable
                    ? () => editingState.deleteEntry(item.id)
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
                      editingState.deleteEntry(item.id);
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

function ActivityFeedItem({
  item,
  onEdit,
  onDelete,
  isDeleting,
}: {
  item: ActivityItem;
  onEdit?: () => void;
  onDelete?: () => void;
  isDeleting?: boolean;
}) {
  const formattedDate = new Date(item.date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const summary = item.summary.trim();
  const truncatedSummary =
    summary.length > 280 ? `${summary.slice(0, 277).trimEnd()}…` : summary;
  const showThumbnail = item.category === "video" && Boolean(item.thumbnailUrl);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <Badge
            variant="secondary"
            className={categoryBadgeClass[item.category]}
          >
            {item.category}
          </Badge>
          <div className="flex items-center gap-2">
            <time
              className="text-xs text-muted-foreground"
              dateTime={item.date}
            >
              {formattedDate}
            </time>
            {onEdit || onDelete ? (
              <div className="flex items-center gap-1">
                {onEdit ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      onEdit();
                    }}
                  >
                    Edit
                  </Button>
                ) : null}
                {onDelete ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-white"
                    onClick={() => {
                      onDelete();
                    }}
                    disabled={isDeleting}
                  >
                    {isDeleting ? "Deleting…" : "Delete"}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex gap-4">
          <div className="flex flex-1 flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              {item.linkUrl ? (
                <a
                  href={item.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {item.title}
                </a>
              ) : (
                item.title
              )}
            </h3>
            {summary.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {truncatedSummary}
              </p>
            ) : null}
            {item.category === "video" && item.linkUrl ? (
              <a
                href={item.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-auto inline-flex pt-2 text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                Watch on YouTube
              </a>
            ) : null}
          </div>
          {showThumbnail && item.thumbnailUrl ? (
            item.linkUrl ? (
              <a
                href={item.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md border border-border sm:h-28 sm:w-28"
                aria-label={`Watch ${item.title} on YouTube`}
              >
                <img
                  src={item.thumbnailUrl}
                  alt={`Thumbnail for ${item.title}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </a>
            ) : (
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md border border-border sm:h-28 sm:w-28">
                <img
                  src={item.thumbnailUrl}
                  alt={`Thumbnail for ${item.title}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
            )
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

const categoryBadgeClass: Record<ActivityItem["category"], string> = {
  video: "bg-accent text-accent-foreground",
  insight: "",
  journal: "bg-primary/10 text-primary",
};

interface ActivityDraftCardProps {
  draft: ActivityDraft;
  onChange: (draft: ActivityDraft) => void;
  onCancel?: () => void;
  onSubmit?: () => void;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  submitLabel?: string;
  category?: ActivityItem["category"];
  idPrefix?: string;
  onDelete?: () => void;
  isDeleting?: boolean;
}

function ActivityDraftCard({
  draft,
  onChange,
  onCancel,
  onSubmit,
  isSubmitting,
  errorMessage,
  submitLabel = "Create entry",
  category = "journal",
  idPrefix = "entry",
  onDelete,
  isDeleting,
}: ActivityDraftCardProps) {
  const isSubmitDisabled =
    draft.title.trim().length === 0 || draft.summary.trim().length === 0;
  const dateInputId = `${idPrefix}-date`;
  const titleInputId = `${idPrefix}-title`;
  const summaryInputId = `${idPrefix}-summary`;
  const videoInputId = `${idPrefix}-video`;

  return (
    <Card className="border-dashed border-primary/40 bg-primary/5">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <Badge variant="secondary" className={categoryBadgeClass[category]}>
            {category}
          </Badge>
          <div className="w-full max-w-[220px] space-y-2 text-left text-xs sm:w-auto">
            <Label
              htmlFor={dateInputId}
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              Date & time
            </Label>
            <Input
              id={dateInputId}
              type="datetime-local"
              value={draft.date}
              onChange={(event) =>
                onChange({ ...draft, date: event.target.value })
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={titleInputId}>Title</Label>
          <Input
            id={titleInputId}
            placeholder="What happened?"
            value={draft.title}
            onChange={(event) =>
              onChange({ ...draft, title: event.target.value })
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={summaryInputId}>Entry</Label>
          <Textarea
            id={summaryInputId}
            placeholder="Capture the beats, insights, or takeaways…"
            value={draft.summary}
            onChange={(event) =>
              onChange({ ...draft, summary: event.target.value })
            }
            rows={6}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={videoInputId}>Linked video ID (optional)</Label>
          <Input
            id={videoInputId}
            placeholder="e.g. abcd1234"
            value={draft.videoId}
            onChange={(event) =>
              onChange({ ...draft, videoId: event.target.value })
            }
          />
          <p className="text-xs text-muted-foreground">
            Paste a YouTube video ID to reference a synced upload.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                void onSubmit?.();
              }}
              disabled={isSubmitDisabled || isSubmitting}
            >
              {isSubmitting ? "Saving…" : submitLabel}
            </Button>
          </div>
          {onDelete ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void onDelete();
              }}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting…" : "Delete entry"}
            </Button>
          ) : null}
        </div>
        {errorMessage ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
