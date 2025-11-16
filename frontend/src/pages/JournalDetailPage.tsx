import { useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useNavigate } from "react-router-dom";
import useLocalStorageState from "use-local-storage-state";

import { type Entry } from "@/api/entries";
import { apiClient } from "@/api/client";
import { useYouTubeFeed } from "@/hooks/useYouTubeFeed";
import { useEntryEditing } from "@/hooks/useEntryEditing";
import { entryToActivityItem } from "@/lib/types/entries";
import { NavBar } from "@/components/NavBar";
import { VideoLinkCard } from "@/components/VideoLinkCard";
import { ActivityDraftCard } from "@/components/ActivityDraftCard";
import { AgentPanel } from "@/components/AgentPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { YoutubeVideoResponse } from "@/api/youtube";
import type { ContentTypeFilter } from "@/components/ContentTypeTabs";

export function JournalDetailPage() {
  const { journalId } = useParams<{ journalId: string }>();
  const navigate = useNavigate();

  const entryQueryKey = ["entries", journalId ?? "missing"] as const;

  const entryQuery = useQuery<Entry, Error, Entry, typeof entryQueryKey>({
    queryKey: entryQueryKey,
    queryFn: (context) => {
      const [, id] = context.queryKey;
      if (!journalId) {
        return Promise.reject(new Error("Journal ID is required"));
      }
      return apiClient
        .get<Entry>(`/entries/${id}`, { signal: context.signal })
        .then((response) => response.data);
    },
    enabled: Boolean(journalId),
  });

  const currentEntry: Entry | null = entryQuery.data ?? null;

  // Set up editing state
  const editingState = useEntryEditing();
  const {
    editingEntryId,
    editingDraft,
    editingError,
    deletingEntryId,
    isUpdating,
    isDeleting,
    startEdit,
    handleEditDraftChange,
    cancelEdit,
    submitEdit,
    deleteEntry,
  } = editingState;

  const isEditing = currentEntry?.id === editingEntryId;
  const activityItem = currentEntry ? entryToActivityItem(currentEntry) : null;
  const deletionInitiatedRef = useRef(false);

  // Track when deletion is initiated
  useEffect(() => {
    if (
      deletingEntryId &&
      journalId &&
      deletingEntryId === journalId
    ) {
      deletionInitiatedRef.current = true;
    }
  }, [deletingEntryId, journalId]);

  // Redirect to home page if entry is deleted
  useEffect(() => {
    if (
      deletionInitiatedRef.current &&
      journalId &&
      !isDeleting(journalId) &&
      (!currentEntry || entryQuery.isError)
    ) {
      // Entry was successfully deleted, navigate away
      deletionInitiatedRef.current = false;
      void navigate("/");
    }
  }, [
    currentEntry,
    entryQuery.isError,
    journalId,
    navigate,
    isDeleting,
  ]);

  const entryDate: string | null = currentEntry?.date ?? null;
  const journalDate = useMemo(() => {
    if (!entryDate) {
      return null;
    }
    const parsed = new Date(entryDate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [entryDate]);

  const formattedDate = journalDate
    ? journalDate.toLocaleString(undefined, {
        dateStyle: "long",
        timeStyle: "short",
      })
    : null;

  const summarySource: string | null = currentEntry?.summary ?? null;
  const summaryText =
    typeof summarySource === "string" ? summarySource.trim() : "";

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
    <div className="flex h-screen flex-col overflow-hidden bg-gradient-to-br from-background to-muted/12 text-foreground">
      <NavBar />
      <main className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary/8 via-transparent to-transparent" />
        <div className="relative grid h-full min-h-0 w-full grid-cols-3 gap-6 px-6 py-12 lg:px-10 xl:px-16">
          <div className="col-span-2 flex h-full min-h-0 flex-col gap-6 overflow-y-auto scrollbar-hide">
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
              ) : !currentEntry ? (
                <p className="text-sm text-muted-foreground">
                  We couldn't find this journal entry.
                </p>
              ) : isEditing && editingDraft ? (
                <div className="space-y-6">
                  <ActivityDraftCard
                    draft={editingDraft}
                    onChange={handleEditDraftChange}
                    onCancel={cancelEdit}
                    onSubmit={() => {
                      void submitEdit();
                    }}
                    isSubmitting={isUpdating}
                    errorMessage={editingError}
                    submitLabel="Save changes"
                    category={currentEntry.category}
                    idPrefix={`edit-entry-${currentEntry.id}`}
                    onDelete={() => {
                      void deleteEntry(currentEntry.id);
                    }}
                    isDeleting={isDeleting(currentEntry.id)}
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
                        {currentEntry.title}
                      </h1>
                      {activityItem && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            startEdit(activityItem);
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
          </div>
          <div className="col-span-1 flex h-full min-h-0">
            <AgentPanel />
          </div>
        </div>
      </main>
    </div>
  );
}

export default JournalDetailPage;
