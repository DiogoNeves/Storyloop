import { Link } from "react-router-dom";

import { type YoutubeVideoResponse } from "@/api/youtube";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface VideoLinkCardProps {
  video: YoutubeVideoResponse;
  contextLabel: string;
}

export function VideoLinkCard({ video, contextLabel }: VideoLinkCardProps) {
  const publishedDate = new Date(video.publishedAt).toLocaleString(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    <Link to={`/videos/${video.id}`} className="block group">
      <Card className="h-full overflow-hidden transition hover:border-primary/60 hover:shadow-sm">
        <CardContent className="flex gap-4 p-4">
          <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
            {video.thumbnailUrl ? (
              <img
                src={video.thumbnailUrl}
                alt={`Thumbnail for ${video.title}`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                No thumbnail
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {contextLabel}
            </p>
            <h3 className="text-base font-semibold text-foreground">
              {video.title}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{publishedDate}</span>
              <Badge variant="secondary" className="capitalize">
                {video.videoType}
              </Badge>
            </div>
            <span className="text-xs font-medium text-primary underline-offset-2 group-hover:underline">
              View video details
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
