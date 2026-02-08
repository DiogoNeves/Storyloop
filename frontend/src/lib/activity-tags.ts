import type { ActivityItem } from "@/lib/types/entries";

export interface TagCount {
  tag: string;
  count: number;
}

const TAG_PATTERN = /#([A-Za-z0-9][A-Za-z0-9/-]*)/g;

export function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/, "").toLowerCase();
}

export function extractTagsFromText(text: string): string[] {
  const tags = new Set<string>();
  if (!text) {
    return [];
  }

  for (const match of text.matchAll(TAG_PATTERN)) {
    const tag = match[1];
    if (!tag) {
      continue;
    }
    tags.add(normalizeTag(tag));
  }

  return [...tags];
}

export function extractTagsFromContent(
  ...values: Array<string | null | undefined>
): string[] {
  const tags = new Set<string>();
  values.forEach((value) => {
    if (!value) {
      return;
    }
    extractTagsFromText(value).forEach((tag) => tags.add(tag));
  });
  return [...tags];
}

export function collectTagCounts(items: ActivityItem[]): TagCount[] {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    (item.tags ?? []).forEach((tag) => {
      const normalized = normalizeTag(tag);
      if (!normalized) {
        return;
      }
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    });
  });

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort(compareTagCounts);
}

export function formatTagLabel(tag: string): string {
  return `#${normalizeTag(tag)}`;
}

function compareTagCounts(a: TagCount, b: TagCount) {
  if (b.count !== a.count) {
    return b.count - a.count;
  }
  return a.tag.localeCompare(b.tag);
}
