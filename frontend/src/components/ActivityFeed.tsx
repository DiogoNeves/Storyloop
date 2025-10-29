import { useCallback, useMemo, useState, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import {
  entriesMutations,
  entriesQueries,
  type Entry,
  type UpdateEntryInput,
} from "@/api/entries";
import { youtubeApi, type YoutubeFeedResponse } from "@/api/youtube";
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

export interface ActivityItem {
  id: string;
  title: string;
  summary: string;
  date: string;
  category: "video" | "insight" | "journal";
  linkUrl?: string;
  thumbnailUrl?: string | null;
  videoId?: string | null;
}

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
  const [channelInput, setChannelInput] = useState("");
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [youtubeFeed, setYoutubeFeed] = useState<YoutubeFeedResponse | null>(
    null,
  );
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<ActivityDraft | null>(null);
  const [editingError, setEditingError] = useState<string | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const updateEntryMutation = useMutation(
    entriesMutations.update(queryClient, {
      onError: (error) => {
        const message =
          error instanceof Error
            ? error.message
            : "We couldn't update this entry. Please try again.";
        setEditingError(message);
      },
      onSuccess: () => {
        setEditingEntryId(null);
        setEditingDraft(null);
        setEditingError(null);
      },
    }),
  );

  const deleteEntryMutation = useMutation(
    entriesMutations.delete(queryClient, {
      onError: (error) => {
        const message =
          error instanceof Error
            ? error.message
            : "We couldn't delete this entry. Please try again.";
        setEditingError(message);
      },
      onSuccess: (_data, id) => {
        if (editingEntryId === id) {
          setEditingEntryId(null);
          setEditingDraft(null);
        }
      },
      onSettled: () => {
        setDeletingEntryId(null);
      },
    }),
  );

  const combinedItems = useMemo(() => {
    const baseItems = [...items];
    if (!youtubeFeed) {
      return baseItems.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
    }

    const videoItems: ActivityItem[] = youtubeFeed.videos.map((video) => ({
      id: `youtube:${video.id}`,
      title: video.title,
      summary: video.description,
      date: video.publishedAt,
      category: "video",
      linkUrl: video.url,
      thumbnailUrl: video.thumbnailUrl,
      videoId: video.id,
    }));

    return [...baseItems, ...videoItems].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [items, youtubeFeed]);

  const handleStartEdit = useCallback((item: ActivityItem) => {
    if (item.category === "video" || item.id.startsWith("youtube:")) {
      return;
    }
    setEditingEntryId(item.id);
    setEditingDraft({
      title: item.title,
      summary: item.summary,
      date: toDateTimeLocalInput(item.date),
      videoId: item.videoId ?? "",
    });
    setEditingError(null);
  }, []);

  const handleEditDraftChange = useCallback((draft: ActivityDraft) => {
    setEditingDraft(draft);
    setEditingError(null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingEntryId(null);
    setEditingDraft(null);
    setEditingError(null);
  }, []);

  const handleSubmitEdit = useCallback(async () => {
    if (!editingEntryId || !editingDraft) {
      return;
    }
    const trimmedTitle = editingDraft.title.trim();
    const trimmedSummary = editingDraft.summary.trim();
    if (trimmedTitle.length === 0 || trimmedSummary.length === 0) {
      setEditingError("Add a title and entry before saving.");
      return;
    }

    const trimmedVideoId = editingDraft.videoId.trim();
    const payload: UpdateEntryInput = {
      id: editingEntryId,
      title: trimmedTitle,
      summary: trimmedSummary,
      date: new Date(editingDraft.date).toISOString(),
      videoId: trimmedVideoId.length > 0 ? trimmedVideoId : null,
    };

    try {
      setEditingError(null);
      await updateEntryMutation.mutateAsync(payload);
    } catch (error: unknown) {
      // handled in the mutation onError callback
    }
  }, [editingDraft, editingEntryId, updateEntryMutation]);

  const handleDeleteEntry = useCallback(
    (id: string) => {
      if (deletingEntryId) {
        return;
      }
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(
          "Are you sure you want to delete this entry?",
        );
        if (!confirmed) {
          return;
        }
      }
      setDeletingEntryId(id);
      setEditingError(null);
      void deleteEntryMutation.mutateAsync(id).catch(() => {
        // handled in the mutation onError callback
      });
    },
    [deleteEntryMutation, deletingEntryId, editingEntryId],
  );

  const handleFetchVideos = useCallback(async () => {
    const trimmed = channelInput.trim();
    if (!trimmed) {
      setYoutubeError("Enter a YouTube channel handle, link, or ID.");
      return;
    }

    setIsLoadingVideos(true);
    setYoutubeError(null);

    try {
      const feed = await youtubeApi.fetchChannelVideos(trimmed);
      setYoutubeFeed(feed);
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        const status = error.response?.status;
        const data = error.response?.data as unknown;
        const detail =
          typeof data === "object" &&
          data !== null &&
          "detail" in data &&
          typeof (data as { detail: unknown }).detail === "string"
            ? (data as { detail: string }).detail
            : null;
        if (status === 404) {
          setYoutubeError(
            detail ?? "We couldn’t find that channel on YouTube.",
          );
        } else if (status === 503) {
          setYoutubeError(
            detail ?? "The server hasn’t been configured for YouTube yet.",
          );
        } else {
          setYoutubeError(detail ?? "We couldn’t load videos from YouTube.");
        }
      } else {
        setYoutubeError("We couldn’t load videos from YouTube.");
      }
    } finally {
      setIsLoadingVideos(false);
    }
  }, [channelInput]);

  const handleChannelKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void handleFetchVideos();
      }
    },
    [handleFetchVideos],
  );

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
                value={channelInput}
                onChange={(event) => setChannelInput(event.target.value)}
                onKeyDown={handleChannelKeyDown}
                placeholder="e.g. @Storyloop or youtube.com/@Storyloop"
                aria-label="YouTube channel"
              />
              <Button
                type="button"
                onClick={() => {
                  void handleFetchVideos();
                }}
                disabled={isLoadingVideos}
                className="shrink-0"
              >
                {isLoadingVideos ? "Loading…" : "Load videos"}
              </Button>
            </div>
            {youtubeFeed ? (
              <p className="text-xs text-muted-foreground">
                Showing {youtubeFeed.videos.length} recent video
                {youtubeFeed.videos.length === 1 ? "" : "s"} from
                <a
                  href={youtubeFeed.channelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 font-medium text-primary underline-offset-2 hover:underline"
                >
                  {youtubeFeed.channelTitle}
                </a>
                .
              </p>
            ) : null}
            {youtubeError ? (
              <p className="text-sm text-destructive" role="status">
                {youtubeError}
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
          const isEditing = editingEntryId === item.id && editingDraft;
          const isEditable =
            item.category !== "video" && !item.id.startsWith("youtube:");
          if (isEditing && editingDraft) {
            return (
              <ActivityDraftCard
                key={item.id}
                draft={editingDraft}
                onChange={handleEditDraftChange}
                onCancel={handleCancelEdit}
                onSubmit={handleSubmitEdit}
                isSubmitting={updateEntryMutation.isPending}
                errorMessage={editingError}
                submitLabel="Save changes"
                category={item.category}
                idPrefix={`edit-entry-${item.id}`}
                onDelete={
                  isEditable ? () => handleDeleteEntry(item.id) : undefined
                }
                isDeleting={
                  deletingEntryId === item.id && deleteEntryMutation.isPending
                }
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
                      handleStartEdit(item);
                    }
                  : undefined
              }
              onDelete={
                isEditable
                  ? () => {
                      handleDeleteEntry(item.id);
                    }
                  : undefined
              }
              isDeleting={
                deletingEntryId === item.id && deleteEntryMutation.isPending
              }
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

interface EntriesMutationContext {
  previousEntries: Entry[] | undefined;
  previousById?: Entry;
  id?: string;
}

function toDateTimeLocalInput(date: string) {
  const original = new Date(date);
  original.setSeconds(0);
  original.setMilliseconds(0);
  const offset = original.getTimezoneOffset();
  const adjusted = new Date(original.getTime() - offset * 60_000);
  return adjusted.toISOString().slice(0, 16);
}
