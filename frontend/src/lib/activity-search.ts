import type { ActivityItem } from "@/lib/types/entries";

export function filterActivityItems(
  items: ActivityItem[],
  query: string,
): ActivityItem[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return items;
  }

  const terms = normalizedQuery.split(" ");

  return items.filter((item) => {
    const searchText = buildActivitySearchText(item);
    return terms.every((term) => {
      if (!term) {
        return true;
      }

      return searchText.includes(term);
    });
  });
}

export function buildActivitySearchText(item: ActivityItem): string {
  return normalizeSearchText(item.title);
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
