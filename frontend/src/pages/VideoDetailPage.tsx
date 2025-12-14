import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";

import {
  fetchVideoDetail,
  type YoutubeVideoDetailResponse,
} from "@/api/youtube";
import { NavBar } from "@/components/NavBar";
import { SettingsDialog } from "@/components/SettingsDialog";
import { VideoStatCards } from "@/components/VideoStatCards";
import { TwoColumnDetailLayout } from "@/components/TwoColumnDetailLayout";
import { StickyHeaderScrollableCard } from "@/components/StickyHeaderScrollableCard";

export function VideoDetailPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const videoDetailQueryKey = [
    "youtube",
    "videos",
    videoId ?? "missing",
    "detail",
  ] as const;

  const videoDetailQuery = useQuery<
    YoutubeVideoDetailResponse,
    Error,
    YoutubeVideoDetailResponse,
    typeof videoDetailQueryKey
  >({
    queryKey: videoDetailQueryKey,
    queryFn: (context) => {
      const [, , id] = context.queryKey;
      if (!videoId) {
        return Promise.reject(new Error("Video ID is required"));
      }
      return fetchVideoDetail(id);
    },
    enabled: Boolean(videoId),
  });

  const video = videoDetailQuery.data;
  const publishedDate = video?.publishedAt
    ? new Date(String(video.publishedAt)).toLocaleString(undefined, {
        dateStyle: "long",
        timeStyle: "short",
      })
    : null;

  const transcriptText = video?.transcript
    ? String(video.transcript).trim()
    : "";
  const descriptionText = video?.description
    ? String(video.description).trim()
    : "";

  const backLink = (
    <Link
      to="/"
      className="text-sm font-medium text-primary underline-offset-2 hover:underline"
    >
      ← Back to activity feed
    </Link>
  );

  const renderCardContent = () => {
    if (!videoId) {
      return (
        <StickyHeaderScrollableCard>
          <p className="text-sm text-muted-foreground">
            We couldn't determine which video to display.
          </p>
        </StickyHeaderScrollableCard>
      );
    }

    if (videoDetailQuery.isLoading) {
      return (
        <StickyHeaderScrollableCard>
          <p className="text-sm text-muted-foreground">
            Loading video details…
          </p>
        </StickyHeaderScrollableCard>
      );
    }

    if (videoDetailQuery.isError) {
      return (
        <StickyHeaderScrollableCard>
          <p className="text-sm text-destructive">
            {videoDetailQuery.error instanceof Error
              ? videoDetailQuery.error.message
              : String(videoDetailQuery.error)}
          </p>
        </StickyHeaderScrollableCard>
      );
    }

    if (!video) {
      return (
        <StickyHeaderScrollableCard>
          <p className="text-sm text-muted-foreground">
            We couldn't find details for this video.
          </p>
        </StickyHeaderScrollableCard>
      );
    }

    const header = (
      <>
        <h1 className="text-2xl font-semibold text-foreground">
          {String(video.title)}
        </h1>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <span>{publishedDate ?? "Publish date unavailable"}</span>
          <a
            href={String(video.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
          >
            Watch on YouTube
          </a>
        </div>
      </>
    );

    const body = (
      <div className="space-y-6">
        <div className="space-y-4">
          <VideoStatCards
            statistics={video.statistics}
            isLoading={videoDetailQuery.isLoading}
          />
          <div className="aspect-video w-full overflow-hidden rounded-md border border-border bg-black">
            <iframe
              title={String(video.title)}
              src={`https://www.youtube.com/embed/${videoId}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
        </div>

        <div className="space-y-4">
          <section>
            <h2 className="text-lg font-semibold text-foreground">
              Description
            </h2>
            <p className="whitespace-pre-line text-sm text-muted-foreground">
              {descriptionText && descriptionText.length > 0
                ? descriptionText
                : "No description available."}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">
              Transcript
            </h2>
            {transcriptText && transcriptText.length > 0 ? (
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                {transcriptText}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Transcript not available yet.
              </p>
            )}
          </section>
        </div>
      </div>
    );

    return (
      <StickyHeaderScrollableCard
        header={header}
        stickyHeaderAt="lg"
        bodyClassName="space-y-6"
      >
        {body}
      </StickyHeaderScrollableCard>
    );
  };

  return (
    <>
      <div className="to-muted/12 relative min-h-screen bg-gradient-to-br from-background text-foreground">
        <NavBar onOpenSettings={() => setIsSettingsOpen(true)} />
        <main className="relative flex min-h-[calc(100vh-4rem)] flex-1 overflow-y-auto pt-16 lg:h-[100dvh] lg:min-h-0 lg:overflow-hidden">
          <div className="from-primary/8 pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b via-transparent to-transparent" />
          <TwoColumnDetailLayout
            leftTop={backLink}
            left={renderCardContent()}
          />
        </main>
      </div>
      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </>
  );
}

export default VideoDetailPage;
