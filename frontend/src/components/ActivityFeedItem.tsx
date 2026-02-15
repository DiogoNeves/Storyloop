import { useState } from "react";
import { Link } from "react-router-dom";
import { Archive, Bot, Pin } from "lucide-react";

import { type ActivityItem } from "@/lib/types/entries";
import { buildActivityFeedItemViewModel } from "@/lib/activity-feed-item-view";
import { useSync } from "@/hooks/useSync";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PendingSyncBadge } from "@/components/ui/pending-sync-badge";
import { DeleteConversationDialog } from "@/components/DeleteConversationDialog";
import { ActivityMarkdownPreview } from "@/components/ActivityMarkdownPreview";
import { cn } from "@/lib/utils";
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
  onPinToggle?: () => void;
  isPinning?: boolean;
  onArchiveToggle?: () => void;
  isArchiving?: boolean;
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
  onPinToggle,
  isPinning = false,
  onArchiveToggle,
  isArchiving = false,
  isPendingSync,
}: ActivityFeedItemProps) {
  const { isOnline } = useSync();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const view = buildActivityFeedItemViewModel({
    item,
    isOnline,
    isDeleting,
    isPinning,
    isArchiving,
  });
  const pinIcon = (
    <Pin className="h-4 w-4" fill={view.isPinned ? "currentColor" : "none"} />
  );

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
              ) : view.isSmartJournal ? (
                <>
                  <Bot className="h-4 w-4" aria-hidden="true" />
                  <span>journal</span>
                </>
              ) : (
                view.categoryLabel
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
            {view.formattedCreatedDate ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <time
                    className="cursor-default text-xs text-muted-foreground"
                    dateTime={item.date}
                  >
                    {view.formattedDate}
                  </time>
                </TooltipTrigger>
                <TooltipContent>
                  Created: {view.formattedCreatedDate}
                </TooltipContent>
              </Tooltip>
            ) : (
              <time
                className="text-xs text-muted-foreground"
                dateTime={item.date}
              >
                {view.formattedDate}
              </time>
            )}
          </div>
        </div>
        <div className="flex gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2 pr-20">
            <h3 className="min-w-0 text-sm font-semibold leading-tight text-foreground">
              {view.detailPath ? (
                <Link
                  to={view.detailPath}
                  className="block overflow-hidden truncate text-primary underline-offset-2 hover:underline"
                  onClick={handleDetailClick}
                  title={view.titleText}
                >
                  {view.titleText}
                </Link>
              ) : item.linkUrl ? (
                <a
                  href={item.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden truncate text-primary underline-offset-2 hover:underline"
                  title={view.titleText}
                >
                  {view.titleText}
                </a>
              ) : (
                <span
                  className="block overflow-hidden truncate"
                  title={view.titleText}
                >
                  {view.titleText}
                </span>
              )}
            </h3>
            {view.summaryText.length > 0 ? (
              <ActivityMarkdownPreview
                text={view.summaryText}
                category={item.category}
                showPlaceholderPulse={view.isSmartSummaryPlaceholder}
              />
            ) : null}
            {view.tagLabels.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {view.tagLabels.map((tag) => (
                  <span
                    key={`${item.id}-${tag}`}
                    className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            {item.category === "content" ? (
              view.detailPath ? (
                <Link
                  to={view.detailPath}
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
          {view.showThumbnail && item.thumbnailUrl ? (
            view.detailPath ? (
              <Link
                to={view.detailPath}
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
        {view.isPinned ? (
          <span
            className="absolute bottom-2 right-4 text-primary opacity-90 transition-opacity group-hover:opacity-0"
            aria-hidden="true"
          >
            <Pin className="h-4 w-4" fill="currentColor" />
          </span>
        ) : null}
        {onEdit ||
        onDelete ||
        onPinToggle ||
        onArchiveToggle ||
        (item.category === "conversation" && onConversationDelete) ? (
          <div className="absolute bottom-2 right-4 hidden items-center gap-2 group-hover:flex">
            {onDelete ? (
              view.isDeleteDisabled ? (
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
            {onEdit ? (
              view.isEditDisabled ? (
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
            {onPinToggle ? (
              view.isPinDisabled ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-not-allowed text-muted-foreground opacity-50">
                      {pinIcon}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {!isOnline ? "You are offline" : "Updating..."}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <button
                  type="button"
                  className={cn(
                    "transition-colors hover:text-foreground",
                    view.isPinned ? "text-primary" : "text-muted-foreground",
                  )}
                  onClick={() => {
                    onPinToggle();
                  }}
                  aria-label={view.pinLabel}
                >
                  {pinIcon}
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
            {onArchiveToggle ? (
              view.isArchiveDisabled ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="inline-flex cursor-not-allowed items-center gap-1 text-xs text-muted-foreground opacity-50"
                      aria-label={view.archiveDisabledAriaLabel}
                    >
                      <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{view.archiveLabel}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{`${view.archiveLabel} unavailable. ${view.archiveDisabledReason}`}</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "transition-colors",
                        view.isArchived
                          ? "text-primary hover:text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => {
                        onArchiveToggle();
                      }}
                      aria-label={view.archiveLabel}
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{view.archiveLabel}</TooltipContent>
                </Tooltip>
              )
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
