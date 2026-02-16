import { normalizeTag } from "@/lib/activity-tags";
import type { ActivityItem } from "@/lib/types/entries";

interface ActivitySearchOptions {
  tag?: string | null;
  tags?: string[];
}

export function filterActivityItems(
  items: ActivityItem[],
  query: string,
  options: ActivitySearchOptions = {},
): ActivityItem[] {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedTags = normalizeSelectedTags(options);
  if (!normalizedQuery) {
    return items.filter((item) => {
      if (normalizedTags.length === 0) {
        return true;
      }
      return itemHasAnyTag(item, normalizedTags);
    });
  }

  const terms = normalizedQuery.split(" ");

  return items.filter((item) => {
    const searchText = buildActivitySearchText(item);
    if (normalizedTags.length > 0 && !itemHasAnyTag(item, normalizedTags)) {
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

function buildActivitySearchText(item: ActivityItem): string {
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

function itemHasAnyTag(item: ActivityItem, tags: string[]): boolean {
  if (tags.length === 0) {
    return true;
  }
  return tags.some((tag) => itemHasTag(item, tag));
}

function normalizeSelectedTags(options: ActivitySearchOptions): string[] {
  const selectedTags = [
    ...(options.tag ? [options.tag] : []),
    ...(options.tags ?? []),
  ];
  const uniqueTags = new Set<string>();

  selectedTags.forEach((tag) => {
    const normalized = normalizeTag(tag);
    if (normalized) {
      uniqueTags.add(normalized);
    }
  });

  return [...uniqueTags];
}
