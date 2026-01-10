import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";

import {
  fetchVideoDetail,
  type YoutubeVideoDetailResponse,
} from "@/api/youtube";
import { NavBar } from "@/components/NavBar";
import { SettingsDialog } from "@/components/SettingsDialog";
import { VideoStatCards } from "@/components/VideoStatCards";
import { TwoColumnDetailLayout } from "@/components/TwoColumnDetailLayout";
import { StickyHeaderScrollableCard } from "@/components/StickyHeaderScrollableCard";
import { useAgentConversationContext } from "@/context/AgentConversationContext";

export function VideoDetailPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [playerStart, setPlayerStart] = useState<{
    start: number | null;
    nonce: number;
  }>({ start: null, nonce: 0 });
  const { setFocus } = useAgentConversationContext();

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

  useEffect(() => {
    if (!videoId) {
      setFocus(null);
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    if (typeof window.matchMedia !== "function") {
      setFocus(null);
      return;
    }
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    if (!isDesktop) {
      setFocus(null);
      return;
    }
    setFocus({
      category: "content",
      id: videoId,
      title: video?.title ? String(video.title) : null,
      route: `/videos/${videoId}`,
    });
    return () => {
      setFocus(null);
    };
  }, [setFocus, video?.title, videoId]);

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

    const chapterLines = parseDescriptionLines(descriptionText);
    const videoEmbedSrc = buildVideoEmbedSrc(videoId, playerStart.start);

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
              key={`${videoId}-${playerStart.nonce}`}
              src={videoEmbedSrc}
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
            {descriptionText && descriptionText.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {chapterLines.map((line, index) => (
                  <span key={`${line.key}-${index}`}>
                    {line.type === "chapter" ? (
                      <>
                        <button
                          type="button"
                          className="text-primary underline-offset-2 hover:underline"
                          onClick={() =>
                            setPlayerStart((previous) => ({
                              start: line.seconds,
                              nonce: previous.nonce + 1,
                            }))
                          }
                        >
                          {line.time}
                        </button>{" "}
                        <span>{line.title}</span>
                      </>
                    ) : (
                      line.text
                    )}
                    {index < chapterLines.length - 1 && <br />}
                  </span>
                ))}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No description available.
              </p>
            )}
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

type DescriptionLine =
  | {
      type: "chapter";
      key: string;
      time: string;
      title: string;
      seconds: number;
    }
  | {
      type: "text";
      key: string;
      text: string;
    };

function parseDescriptionLines(descriptionText: string): DescriptionLine[] {
  if (!descriptionText) {
    return [];
  }

  const chapterPattern = /^((?:\d{1,2}:)?\d{1,2}:\d{2})\s+(.+)$/;

  return descriptionText.split(/\r?\n/).map((line, index) => {
    const trimmed = line.trim();
    const chapterMatch = chapterPattern.exec(trimmed);
    if (!chapterMatch) {
      return {
        type: "text",
        key: `text-${index}`,
        text: line,
      };
    }

    const [, time, title] = chapterMatch;
    const seconds = parseTimestampToSeconds(time);
    if (seconds === null) {
      return {
        type: "text",
        key: `text-${index}`,
        text: line,
      };
    }

    return {
      type: "chapter",
      key: `chapter-${index}`,
      time,
      title,
      seconds,
    };
  });
}

function parseTimestampToSeconds(timestamp: string): number | null {
  const parts = timestamp.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return null;
}

function buildVideoEmbedSrc(videoId: string, start: number | null) {
  const url = new URL(`https://www.youtube.com/embed/${videoId}`);
  if (start !== null) {
    url.searchParams.set("start", String(start));
    url.searchParams.set("autoplay", "1");
  }
  return url.toString();
}
