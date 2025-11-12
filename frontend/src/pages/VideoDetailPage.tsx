import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { youtubeQueries, type YoutubeVideoDetailResponse } from "@/api/youtube";

export function VideoDetailPage() {
  const { videoId } = useParams<{ videoId: string }>();

  const videoDetailQuery = useQuery<YoutubeVideoDetailResponse, Error>({
    queryKey: videoId
      ? youtubeQueries.videoDetail(videoId).queryKey
      : ["youtube", "videos", "detail", "missing"],
    queryFn: videoId
      ? youtubeQueries.videoDetail(videoId).queryFn
      : () => Promise.reject(new Error("Video ID is required")),
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
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
  );
}

export default VideoDetailPage;
