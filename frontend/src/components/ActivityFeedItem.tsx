import { Link } from "react-router-dom";
import { Bot } from "lucide-react";

import { type ActivityItem } from "@/lib/types/entries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

// eslint-disable-next-line react-refresh/only-export-components
export const categoryBadgeClass: Record<ActivityItem["category"], string> = {
  content: "bg-accent text-accent-foreground",
  insight: "",
  journal: "bg-primary/10 text-primary",
  conversation: "bg-primary/10 text-primary",
};

interface ActivityFeedItemProps {
  item: ActivityItem;
  onEdit?: () => void;
  onDelete?: () => void;
  isDeleting?: boolean;
  onConversationClick?: (conversationId: string) => Promise<void>;
  onConversationDelete?: () => void;
  isConversationDeleting?: boolean;
}

export function ActivityFeedItem({
  item,
  onEdit,
  onDelete,
  isDeleting,
  onConversationClick,
  onConversationDelete,
  isConversationDeleting,
}: ActivityFeedItemProps) {
  const formattedDate = new Date(item.date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const summary = item.summary.trim();
  const truncatedSummary =
    summary.length > 280 ? `${summary.slice(0, 277).trimEnd()}…` : summary;
  const showThumbnail = item.category === "content" && Boolean(item.thumbnailUrl);
  const detailPath =
    item.category === "content" && item.videoId
      ? `/videos/${item.videoId}`
      : item.category === "journal"
        ? `/journals/${item.id}`
        : item.category === "conversation"
          ? `/conversations/${item.id}`
          : null;

  const handleDetailClick = () => {
    if (item.category === "conversation" && onConversationClick) {
      void onConversationClick(item.id).catch(() => {
        return undefined;
      });
    }
  };
  const handleConversationDelete = () => {
    if (item.category === "conversation" && onConversationDelete) {
      onConversationDelete();
    }
  };

  return (
    <Card className="group">
      <CardContent className="relative space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className={categoryBadgeClass[item.category]}
            >
              {item.category === "conversation" ? (
                <>
                  <Bot className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Conversation</span>
                </>
              ) : (
                item.category
              )}
            </Badge>
            {item.videoType ? (
              <span className="text-xs text-muted-foreground">
                ({item.videoType})
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <time
              className="text-xs text-muted-foreground"
              dateTime={item.date}
            >
              {formattedDate}
            </time>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2 pr-20">
            <h3 className="text-sm font-semibold text-foreground">
              {detailPath ? (
                <Link
                  to={detailPath}
                  title={item.title}
                  className="block truncate text-primary underline-offset-2 hover:underline"
                  onClick={handleDetailClick}
                >
                  {item.title}
                </Link>
              ) : item.linkUrl ? (
                <a
                  href={item.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={item.title}
                  className="block truncate text-primary underline-offset-2 hover:underline"
                >
                  {item.title}
                </a>
              ) : (
                <span className="block truncate" title={item.title}>
                  {item.title}
                </span>
              )}
            </h3>
            {summary.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {truncatedSummary}
              </p>
            ) : null}
            {item.category === "content" ? (
              detailPath ? (
                <Link
                  to={detailPath}
                  className="mt-auto inline-flex pt-2 text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  View video details
                </Link>
              ) : item.linkUrl ? (
                <a
                  href={item.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto inline-flex pt-2 text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  Watch on YouTube
                </a>
              ) : null
            ) : null}
          </div>
          {showThumbnail && item.thumbnailUrl ? (
            detailPath ? (
              <Link
                to={detailPath}
                className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md border border-border sm:h-28 sm:w-28"
                aria-label={`View details for ${item.title}`}
              >
                <img
                  src={item.thumbnailUrl}
                  alt={`Thumbnail for ${item.title}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </Link>
            ) : item.linkUrl ? (
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
        {onEdit || onDelete || (item.category === "conversation" && onConversationDelete) ? (
          <div className="absolute bottom-2 right-4 hidden items-center gap-2 group-hover:flex">
            {onEdit ? (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => {
                  onEdit();
                }}
              >
                Edit
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                onClick={() => {
                  onDelete();
                }}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </button>
            ) : null}
            {item.category === "conversation" && onConversationDelete ? (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                onClick={handleConversationDelete}
                disabled={isConversationDeleting}
              >
                {isConversationDeleting ? "Deleting…" : "Delete"}
              </button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
