import { useState } from "react";
import { Link } from "react-router-dom";
import { Bot } from "lucide-react";

import { type ActivityItem } from "@/lib/types/entries";
import {
  getActivityCategoryLabel,
  getActivityDetailPath,
} from "@/lib/activity-helpers";
import { useSync } from "@/hooks/useSync";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PendingSyncBadge } from "@/components/ui/pending-sync-badge";
import { DeleteConversationDialog } from "@/components/DeleteConversationDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// eslint-disable-next-line react-refresh/only-export-components
export const categoryBadgeClass: Record<ActivityItem["category"], string> = {
  content: "bg-accent text-accent-foreground",
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
  /** Whether this entry is pending sync (created offline) */
  isPendingSync?: boolean;
}

export function ActivityFeedItem({
  item,
  onEdit,
  onDelete,
  isDeleting,
  onConversationClick,
  onConversationDelete,
  isConversationDeleting,
  isPendingSync,
}: ActivityFeedItemProps) {
  const { isOnline } = useSync();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // Disable edit/delete when offline
  const isEditDisabled = !isOnline;
  const isDeleteDisabled = !isOnline || isDeleting;
  const formattedDate = new Date(item.date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const titleText = item.title.trim();
  const summary = item.summary.trim();
  const truncatedSummary =
    summary.length > 280 ? `${summary.slice(0, 277).trimEnd()}…` : summary;
  const showThumbnail =
    item.category === "content" && Boolean(item.thumbnailUrl);
  const detailPath = getActivityDetailPath(item);
  const categoryLabel = getActivityCategoryLabel(item.category);

  const handleDetailClick = () => {
    if (item.category === "conversation" && onConversationClick) {
      void onConversationClick(item.id).catch(() => {
        return undefined;
      });
    }
  };
  const handleConversationDelete = () => {
    if (item.category === "conversation" && onConversationDelete) {
      setIsConfirmingDelete(true);
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
                categoryLabel
              )}
            </Badge>
            {item.videoType ? (
              <span className="text-xs text-muted-foreground">
                ({item.videoType})
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {isPendingSync && <PendingSyncBadge />}
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
            <h3 className="min-w-0 text-sm font-semibold leading-tight text-foreground">
              {detailPath ? (
                <Link
                  to={detailPath}
                  className="block overflow-hidden truncate text-primary underline-offset-2 hover:underline"
                  onClick={handleDetailClick}
                  title={titleText}
                >
                  {titleText}
                </Link>
              ) : item.linkUrl ? (
                <a
                  href={item.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden truncate text-primary underline-offset-2 hover:underline"
                  title={titleText}
                >
                  {titleText}
                </a>
              ) : (
                <span
                  className="block overflow-hidden truncate"
                  title={titleText}
                >
                  {titleText}
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
        {onEdit ||
        onDelete ||
        (item.category === "conversation" && onConversationDelete) ? (
          <div className="absolute bottom-2 right-4 hidden items-center gap-2 group-hover:flex">
            {onEdit ? (
              isEditDisabled ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-not-allowed text-xs text-muted-foreground opacity-50">
                      Edit
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>You are offline</TooltipContent>
                </Tooltip>
              ) : (
                <button
                  type="button"
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => {
                    onEdit();
                  }}
                >
                  Edit
                </button>
              )
            ) : null}
            {onDelete ? (
              isDeleteDisabled ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-not-allowed text-xs text-muted-foreground opacity-50">
                      {isDeleting ? "Deleting…" : "Delete"}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {!isOnline ? "You are offline" : "Deleting..."}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <button
                  type="button"
                  className="text-xs text-muted-foreground transition-colors hover:text-destructive"
                  onClick={() => {
                    onDelete();
                  }}
                >
                  Delete
                </button>
              )
            ) : null}
            {item.category === "conversation" && onConversationDelete ? (
              <button
                type="button"
                className="text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                onClick={handleConversationDelete}
                disabled={isConversationDeleting}
              >
                {isConversationDeleting ? "Deleting…" : "Delete"}
              </button>
            ) : null}
          </div>
        ) : null}

        <DeleteConversationDialog
          open={isConfirmingDelete}
          onOpenChange={setIsConfirmingDelete}
          isDeleting={isConversationDeleting}
          description="This Loopie conversation will be removed from your activity feed. This action cannot be undone."
          onConfirm={() => {
            setIsConfirmingDelete(false);
            onConversationDelete?.();
          }}
        />
      </CardContent>
    </Card>
  );
}
