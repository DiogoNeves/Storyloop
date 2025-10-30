import { type ActivityItem } from "@/lib/types/entries";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const categoryBadgeClass: Record<ActivityItem["category"], string> = {
  video: "bg-accent text-accent-foreground",
  insight: "",
  journal: "bg-primary/10 text-primary",
};

interface ActivityFeedItemProps {
  item: ActivityItem;
  onEdit?: () => void;
  onDelete?: () => void;
  isDeleting?: boolean;
}

export function ActivityFeedItem({
  item,
  onEdit,
  onDelete,
  isDeleting,
}: ActivityFeedItemProps) {
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

