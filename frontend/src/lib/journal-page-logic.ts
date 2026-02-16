import type { CreateEntryInput, Entry } from "@/api/entries";
import type { ActivityDraft } from "@/components/ActivityFeed";
import { extractTagsFromContent } from "@/lib/activity-tags";
import {
  compareEntriesByPinnedDate,
  type ActivityItem,
} from "@/lib/types/entries";

export function buildJournalEntryInput(
  draft: ActivityDraft,
  entryId: string,
): CreateEntryInput {
  const trimmedPromptFormat = (draft.promptFormat ?? "").trim();
  return {
    id: entryId,
    title: draft.title.trim(),
    summary: "",
    date: new Date(draft.date).toISOString(),
    category: "journal",
    pinned: false,
    promptBody: (draft.promptBody ?? "").trim(),
    promptFormat: trimmedPromptFormat.length > 0 ? trimmedPromptFormat : null,
  };
}

export function buildOptimisticJournalEntry(
  entryInput: CreateEntryInput,
  optimisticUpdatedAt: string,
): Entry {
  return {
    ...entryInput,
    pinned: entryInput.pinned ?? false,
    archived: false,
    tags: extractTagsFromContent(
      entryInput.title,
      entryInput.summary,
      entryInput.promptBody,
    ),
    videoId: null,
    videoType: null,
    updatedAt: optimisticUpdatedAt,
    lastSmartUpdateAt: null,
  };
}

export function upsertSortedEntry(
  current: Entry[] | undefined,
  nextEntry: Entry,
): Entry[] {
  const next = (current ?? []).filter((entry) => entry.id !== nextEntry.id);
  next.push(nextEntry);
  next.sort(compareEntriesByPinnedDate);
  return next;
}

export function isLikelyNetworkError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "Network Error" ||
      error.message.includes("Failed to fetch") ||
      error.message.includes("NetworkError"))
  );
}

export function pruneInactiveTags(
  activeTags: string[],
  displayItems: ActivityItem[],
): string[] {
  if (activeTags.length === 0) {
    return activeTags;
  }

  const visibleTags = new Set<string>();
  displayItems.forEach((item) => {
    (item.tags ?? []).forEach((tag) => visibleTags.add(tag));
  });

  const nextActiveTags = activeTags.filter((tag) => visibleTags.has(tag));
  return nextActiveTags.length === activeTags.length
    ? activeTags
    : nextActiveTags;
}
