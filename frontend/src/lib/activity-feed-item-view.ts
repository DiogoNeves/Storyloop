import type { ActivityItem } from "@/lib/types/entries";
import {
  getActivityCategoryLabel,
  getActivityDetailPath,
} from "@/lib/activity-helpers";
import { formatTagLabel } from "@/lib/activity-tags";

interface BuildActivityFeedItemViewParams {
  item: ActivityItem;
  isOnline: boolean;
  isDeleting?: boolean;
  isPinning?: boolean;
  isArchiving?: boolean;
}

export interface ActivityFeedItemViewModel {
  isEditDisabled: boolean;
  isDeleteDisabled: boolean;
  isPinned: boolean;
  isPinDisabled: boolean;
  isArchived: boolean;
  isArchiveDisabled: boolean;
  formattedDate: string;
  formattedCreatedDate: string | null;
  titleText: string;
  isSmartJournal: boolean;
  summaryText: string;
  isSmartSummaryPlaceholder: boolean;
  truncatedSummary: string;
  showThumbnail: boolean;
  detailPath: string | null;
  categoryLabel: string;
  pinLabel: string;
  archiveLabel: string;
  archiveDisabledReason: string;
  archiveDisabledAriaLabel: string;
  tagLabels: string[];
}

export function buildActivityFeedItemViewModel({
  item,
  isOnline,
  isDeleting,
  isPinning = false,
  isArchiving = false,
}: BuildActivityFeedItemViewParams): ActivityFeedItemViewModel {
  const isEditDisabled = !isOnline;
  const isDeleteDisabled = !isOnline || Boolean(isDeleting);
  const isPinned = item.category === "journal" && Boolean(item.pinned);
  const isPinDisabled = !isOnline || isPinning;
  const isArchived = item.category === "journal" && Boolean(item.archived);
  const isArchiveDisabled = !isOnline || isArchiving;

  const formattedDate = new Date(item.date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const formattedCreatedDate = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const titleText = item.title.trim();
  const isSmartJournal = item.category === "journal" && Boolean(item.promptBody);
  const summary = item.summary.trim();
  const isSmartSummaryPlaceholder = isSmartJournal && summary.length === 0;
  const summaryText = isSmartSummaryPlaceholder
    ? "Loopie is preparing the first update…"
    : summary;
  const truncatedSummary =
    summaryText.length > 280
      ? `${summaryText.slice(0, 277).trimEnd()}…`
      : summaryText;

  const showThumbnail = item.category === "content" && Boolean(item.thumbnailUrl);
  const detailPath = getActivityDetailPath(item);
  const categoryLabel = getActivityCategoryLabel(item.category);
  const pinLabel = isPinned ? "Unpin" : "Pin";
  const archiveLabel = isArchived ? "Unarchive" : "Archive";
  const archiveDisabledReason = !isOnline ? "You are offline" : "Updating...";
  const archiveDisabledAriaLabel = isArchived
    ? "Archived. Unarchive unavailable."
    : "Not archived. Archive unavailable.";
  const tagLabels =
    item.category === "journal"
      ? (item.tags ?? []).map((tag) => formatTagLabel(tag))
      : [];

  return {
    isEditDisabled,
    isDeleteDisabled,
    isPinned,
    isPinDisabled,
    isArchived,
    isArchiveDisabled,
    formattedDate,
    formattedCreatedDate,
    titleText,
    isSmartJournal,
    summaryText,
    isSmartSummaryPlaceholder,
    truncatedSummary,
    showThumbnail,
    detailPath,
    categoryLabel,
    pinLabel,
    archiveLabel,
    archiveDisabledReason,
    archiveDisabledAriaLabel,
    tagLabels,
  };
}
