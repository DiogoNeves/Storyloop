import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";

import { fetchVideoDetail, type YoutubeVideoDetailResponse } from "@/api/youtube";
import { NavBar } from "@/components/NavBar";
import { LoopiePanel } from "@/components/LoopiePanel";
import { SettingsDialog } from "@/components/SettingsDialog";

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

  const transcriptText = video?.transcript ? String(video.transcript).trim() : "";
  const descriptionText = video?.description ? String(video.description).trim() : "";

  return (
    <>
      <div className="relative min-h-screen bg-gradient-to-br from-background to-muted/12 text-foreground">
        <NavBar onOpenSettings={() => setIsSettingsOpen(true)} />
        <main className="relative flex min-h-[calc(100vh-4rem)] flex-1 overflow-y-auto pt-16 lg:overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary/8 via-transparent to-transparent" />
          <div className="relative grid h-full min-h-[calc(100vh-4rem)] w-full grid-cols-1 gap-6 px-6 py-10 sm:py-12 lg:grid-cols-3 lg:overflow-hidden lg:px-10 xl:px-16">
            <div className="col-span-2 flex h-full min-h-0 flex-col gap-6 overflow-y-auto scrollbar-hide">
              <Link
                to="/"
                className="text-sm font-medium text-primary underline-offset-2 hover:underline"
              >
                ← Back to activity feed
              </Link>
              <section className="space-y-6 rounded-lg border border-border bg-background p-6 shadow-sm">
                {!videoId ? (
                  <p className="text-sm text-muted-foreground">
                    We couldn’t determine which video to display.
                  </p>
                ) : videoDetailQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading video details…</p>
                ) : videoDetailQuery.isError ? (
                  <p className="text-sm text-destructive">
                    {videoDetailQuery.error instanceof Error
                      ? videoDetailQuery.error.message
                      : String(videoDetailQuery.error)}
                  </p>
                ) : !video ? (
                  <p className="text-sm text-muted-foreground">
                    We couldn’t find details for this video.
                  </p>
                ) : (
                  <div className="space-y-6">
                    <div className="space-y-4">
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
                        <h2 className="text-lg font-semibold text-foreground">Description</h2>
                        <p className="whitespace-pre-line text-sm text-muted-foreground">
                          {descriptionText && descriptionText.length > 0
                            ? descriptionText
                            : "No description available."}
                        </p>
                      </section>

                      <section>
                        <h2 className="text-lg font-semibold text-foreground">Transcript</h2>
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
                )}
              </section>
            </div>
            <div className="col-span-1 hidden h-full min-h-0 lg:flex">
              <LoopiePanel />
            </div>
          </div>
        </main>
      </div>
      <SettingsDialog
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
      />
    </>
  );
}

export default VideoDetailPage;
