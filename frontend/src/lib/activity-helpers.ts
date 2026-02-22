import type { ActivityItem } from "@/lib/types/entries";

export function isActivityEditable(item: ActivityItem): boolean {
  return (
    item.category !== "content" &&
    item.category !== "conversation" &&
    item.category !== "today" &&
    !item.id.startsWith("youtube:")
  );
}

export function getActivityDetailPath(item: ActivityItem): string | null {
  if (item.category === "content" && item.videoId) {
    return `/videos/${item.videoId}`;
  }
  if (item.category === "journal" || item.category === "today") {
    return `/journals/${item.id}`;
  }
  if (item.category === "conversation") {
    return `/conversations/${item.id}`;
  }
  return null;
}
