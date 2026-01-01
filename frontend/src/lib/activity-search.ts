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
    return terms.every((term) => fuzzyMatch(term, searchText));
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

function fuzzyMatch(term: string, text: string): boolean {
  if (!term) {
    return true;
  }

  if (text.includes(term)) {
    return true;
  }

  return isSubsequence(term, text);
}

function isSubsequence(term: string, text: string): boolean {
  let termIndex = 0;
  for (let textIndex = 0; textIndex < text.length; textIndex += 1) {
    if (text[textIndex] === term[termIndex]) {
      termIndex += 1;
      if (termIndex >= term.length) {
        return true;
      }
    }
  }
  return false;
}
