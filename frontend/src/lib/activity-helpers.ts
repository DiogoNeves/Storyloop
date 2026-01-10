import type { ActivityItem } from "@/lib/types/entries";

export function getActivityCategoryLabel(
  category: ActivityItem["category"],
): string {
  return category;
}

export function isActivityEditable(item: ActivityItem): boolean {
  return (
    item.category !== "content" &&
    item.category !== "conversation" &&
    !item.id.startsWith("youtube:")
  );
}

export function getActivityDetailPath(item: ActivityItem): string | null {
  if (item.category === "content" && item.videoId) {
    return `/videos/${item.videoId}`;
  }
  if (item.category === "journal") {
    return `/journals/${item.id}`;
  }
  if (item.category === "conversation") {
    return `/conversations/${item.id}`;
  }
  return null;
}
