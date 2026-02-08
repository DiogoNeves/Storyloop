import { normalizeTag } from "@/lib/activity-tags";
import type { ActivityItem } from "@/lib/types/entries";

interface ActivitySearchOptions {
  tag?: string | null;
}

const ARCHIVED_TAG = "archived";

export function filterActivityItems(
  items: ActivityItem[],
  query: string,
  options: ActivitySearchOptions = {},
): ActivityItem[] {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedTag = options.tag ? normalizeTag(options.tag) : "";
  const allowArchived = normalizedTag === ARCHIVED_TAG;
  if (!normalizedQuery) {
    return items.filter((item) => {
      if (!allowArchived && itemHasTag(item, ARCHIVED_TAG)) {
        return false;
      }
      if (!normalizedTag) {
        return true;
      }
      return itemHasTag(item, normalizedTag);
    });
  }

  const terms = normalizedQuery.split(" ");

  return items.filter((item) => {
    const searchText = buildActivitySearchText(item);
    if (!allowArchived && itemHasTag(item, ARCHIVED_TAG)) {
      return false;
    }
    if (normalizedTag && !itemHasTag(item, normalizedTag)) {
      return false;
    }
    return terms.every((term) => {
      if (!term) {
        return true;
      }

      return searchText.includes(term);
    });
  });
}

export function buildActivitySearchText(item: ActivityItem): string {
  // Search over both title and summary/description content.
  const tagText = (item.tags ?? []).map((tag) => `#${tag}`).join(" ");
  return normalizeSearchText(`${item.title} ${item.summary} ${tagText}`);
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function itemHasTag(item: ActivityItem, tag: string): boolean {
  if (!tag) {
    return true;
  }
  return (item.tags ?? []).some((itemTag) => normalizeTag(itemTag) === tag);
}
