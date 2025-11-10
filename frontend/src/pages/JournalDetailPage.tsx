import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { entriesQueries, type Entry } from "@/api/entries";
import { useYouTubeFeed } from "@/hooks/useYouTubeFeed";
import { NavBar } from "@/components/NavBar";
import { VideoLinkCard } from "@/components/VideoLinkCard";
import { Card, CardContent } from "@/components/ui/card";
import type { YoutubeVideoResponse } from "@/api/youtube";

export function JournalDetailPage() {
  const { journalId } = useParams<{ journalId: string }>();

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

  const youtubeState = useYouTubeFeed(null);

  const adjacentVideos = useMemo(() => {
    if (!youtubeState.youtubeFeed?.videos || !journalDate) {
      return { previous: null, next: null };
    }

    const sortedVideos = [...youtubeState.youtubeFeed.videos].sort(
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
  }, [journalDate, youtubeState.youtubeFeed?.videos]);

  const renderVideoCard = (
    label: string,
    video: YoutubeVideoResponse | null,
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
            We couldn’t find a video {label.toLowerCase()} this journal entry.
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
              We couldn’t find this journal entry.
            </p>
          ) : (
            <div className="space-y-6">
              <div className="space-y-4">
                <h1 className="text-2xl font-semibold text-foreground">
                  {entry.title}
                </h1>
                <div className="flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
                  <span>{formattedDate ?? "Entry date unavailable"}</span>
                  {entry.videoId ? (
                    <Link
                      to={`/videos/${entry.videoId}`}
                      className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                    >
                      View linked video
                    </Link>
                  ) : null}
                </div>
                <p className="whitespace-pre-line text-sm text-muted-foreground">
                  {summaryText.length > 0
                    ? summaryText
                    : "No notes saved for this journal entry."}
                </p>
              </div>

              <div className="h-px w-full bg-border" aria-hidden="true" />

              <div className="grid gap-4 md:grid-cols-2">
                {renderVideoCard("Published before this journal", adjacentVideos.previous)}
                {renderVideoCard("Published after this journal", adjacentVideos.next)}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default JournalDetailPage;
