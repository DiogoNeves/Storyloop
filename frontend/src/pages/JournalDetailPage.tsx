import { useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useNavigate } from "react-router-dom";
import useLocalStorageState from "use-local-storage-state";

import { entriesQueries, type Entry } from "@/api/entries";
import { useYouTubeFeed } from "@/hooks/useYouTubeFeed";
import { useEntryEditing } from "@/hooks/useEntryEditing";
import { entryToActivityItem } from "@/lib/types/entries";
import { NavBar } from "@/components/NavBar";
import { VideoLinkCard } from "@/components/VideoLinkCard";
import { ActivityDraftCard } from "@/components/ActivityDraftCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { YoutubeVideoResponse } from "@/api/youtube";
import type { ContentTypeFilter } from "@/components/ContentTypeTabs";

export function JournalDetailPage() {
  const { journalId } = useParams<{ journalId: string }>();
  const navigate = useNavigate();

  const entryQuery = useQuery<Entry, Error>({
    queryKey: journalId
      ? entriesQueries.byId(journalId).queryKey
      : ["entries", "missing", "detail"],
    queryFn: journalId
      ? entriesQueries.byId(journalId).queryFn
      : () => Promise.reject(new Error("Journal ID is required")),
    enabled: Boolean(journalId),
  });

  const entry = entryQuery.data;

  // Set up editing state
  const editingState = useEntryEditing();
  const isEditing = entry && editingState.editingEntryId === entry.id;
  const activityItem = entry ? entryToActivityItem(entry) : null;
  const deletionInitiatedRef = useRef(false);

  // Track when deletion is initiated
  useEffect(() => {
    if (
      editingState.deletingEntryId &&
      journalId &&
      editingState.deletingEntryId === journalId
    ) {
      deletionInitiatedRef.current = true;
    }
  }, [editingState.deletingEntryId, journalId]);

  // Redirect to home page if entry is deleted
  useEffect(() => {
    if (
      deletionInitiatedRef.current &&
      journalId &&
      !editingState.isDeleting(journalId) &&
      (!entry || entryQuery.isError)
    ) {
      // Entry was successfully deleted, navigate away
      deletionInitiatedRef.current = false;
      navigate("/");
    }
  }, [
    deletionInitiatedRef,
    editingState.isDeleting,
    entry,
    entryQuery.isError,
    journalId,
    navigate,
  ]);

  const journalDate = useMemo(() => {
    if (!entry?.date) {
      return null;
    }
    const parsed = new Date(entry.date);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [entry?.date]);

  const formattedDate = journalDate
    ? journalDate.toLocaleString(undefined, {
        dateStyle: "long",
        timeStyle: "short",
      })
    : null;

  const summaryText = entry?.summary?.trim() ?? "";

  // Read filter state from localStorage (same as ActivityFeed)
  const [contentTypeFilter] = useLocalStorageState<ContentTypeFilter>(
    "contentTypeFilter",
    {
      defaultValue: "all",
    },
  );

  const [publicOnly] = useLocalStorageState<boolean>("publicOnlyFilter", {
    defaultValue: true,
  });

  // Determine videoType filter for API calls: null if "all", otherwise the type
  const videoTypeFilter = useMemo<"short" | "video" | "live" | null>(() => {
    if (contentTypeFilter === "all") {
      return null;
    }
    return contentTypeFilter;
  }, [contentTypeFilter]);

  const youtubeState = useYouTubeFeed(videoTypeFilter);

  const adjacentVideos = useMemo(() => {
    if (!youtubeState.youtubeFeed?.videos || !journalDate) {
      return { previous: null, next: null };
    }

    // Apply the same filtering logic as ActivityFeed
    const filteredVideos = youtubeState.youtubeFeed.videos.filter((video) => {
      // Filter by content type
      if (!video.videoType) {
        // Include items without videoType only if not filtering by type
        if (contentTypeFilter !== "all") return false;
      } else {
        if (contentTypeFilter !== "all") {
          if (video.videoType !== contentTypeFilter) return false;
        }
      }

      // Filter by privacy status if "public only" is enabled
      if (publicOnly) {
        // Only include public videos (exclude unlisted and private)
        if (video.privacyStatus !== "public") return false;
      }

      return true;
    });

    const sortedVideos = [...filteredVideos].sort(
      (a, b) =>
        new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime(),
    );

    let previous: YoutubeVideoResponse | null = null;
    let next: YoutubeVideoResponse | null = null;
    const journalTime = journalDate.getTime();

    for (const video of sortedVideos) {
      const publishedTime = new Date(video.publishedAt).getTime();
      if (Number.isNaN(publishedTime)) {
        continue;
      }
      if (publishedTime <= journalTime) {
        previous = video;
        continue;
      }
      if (!next && publishedTime > journalTime) {
        next = video;
        break;
      }
    }

    return { previous, next };
  }, [
    journalDate,
    youtubeState.youtubeFeed?.videos,
    contentTypeFilter,
    publicOnly,
  ]);

  const renderVideoCard = (
    label: string,
    video: YoutubeVideoResponse | null,
    emptyMessage: string,
  ) => {
    if (!youtubeState.isLinked) {
      return (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Link your YouTube account to see videos near this journal entry.
          </CardContent>
        </Card>
      );
    }

    if (youtubeState.youtubeError) {
      return (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            {youtubeState.youtubeError}
          </CardContent>
        </Card>
      );
    }

    if (youtubeState.isLoading) {
      return (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Loading videos…
          </CardContent>
        </Card>
      );
    }

    if (!video) {
      return (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            {emptyMessage}
          </CardContent>
        </Card>
      );
    }

    return <VideoLinkCard video={video} contextLabel={label} />;
  };

  return (
    <div className="min-h-screen bg-muted/20 text-foreground">
      <NavBar />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <Link
          to="/"
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          ← Back to activity feed
        </Link>
        <section className="space-y-6 rounded-lg border border-border bg-background p-6 shadow-sm">
          {!journalId ? (
            <p className="text-sm text-muted-foreground">
              We couldn’t determine which journal entry to display.
            </p>
          ) : entryQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading journal entry…</p>
          ) : entryQuery.isError ? (
            <p className="text-sm text-destructive">
              {entryQuery.error instanceof Error
                ? entryQuery.error.message
                : String(entryQuery.error)}
            </p>
          ) : !entry ? (
            <p className="text-sm text-muted-foreground">
              We couldn't find this journal entry.
            </p>
          ) : isEditing && editingState.editingDraft ? (
            <div className="space-y-6">
              <ActivityDraftCard
                draft={editingState.editingDraft}
                onChange={editingState.handleEditDraftChange}
                onCancel={editingState.cancelEdit}
                onSubmit={() => {
                  void editingState.submitEdit();
                }}
                isSubmitting={editingState.isUpdating}
                errorMessage={editingState.editingError}
                submitLabel="Save changes"
                category={entry.category}
                idPrefix={`edit-entry-${entry.id}`}
                onDelete={() => {
                  void editingState.deleteEntry(entry.id);
                }}
                isDeleting={editingState.isDeleting(entry.id)}
              />

              <div className="h-px w-full bg-border" aria-hidden="true" />

              <div className="grid gap-4 md:grid-cols-2">
                {renderVideoCard(
                  "Published before this journal",
                  adjacentVideos.previous,
                  "No earlier video yet—this journal leads the way!",
                )}
                {renderVideoCard(
                  "Published after this journal",
                  adjacentVideos.next,
                  "Looking forward to your next video!",
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <h1 className="text-2xl font-semibold text-foreground">
                    {entry.title}
                  </h1>
                  {activityItem && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        editingState.startEdit(activityItem);
                      }}
                    >
                      Edit entry
                    </Button>
                  )}
                </div>
                <div className="flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
                  <span>{formattedDate ?? "Entry date unavailable"}</span>
                </div>
                <p className="whitespace-pre-line text-sm text-muted-foreground">
                  {summaryText.length > 0
                    ? summaryText
                    : "No notes saved for this journal entry."}
                </p>
              </div>

              <div className="h-px w-full bg-border" aria-hidden="true" />

              <div className="grid gap-4 md:grid-cols-2">
                {renderVideoCard(
                  "Published before this journal",
                  adjacentVideos.previous,
                  "No earlier video yet—this journal leads the way!",
                )}
                {renderVideoCard(
                  "Published after this journal",
                  adjacentVideos.next,
                  "Looking forward to your next video!",
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default JournalDetailPage;
