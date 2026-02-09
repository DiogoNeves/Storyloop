/**
 * Entry types and transformation utilities.
 *
 * This module provides a single source of truth for entry-related types
 * and pure transformation functions to convert between different shapes.
 */

/**
 * Entry shape as returned from the backend API.
 */
export interface Entry {
  id: string;
  title: string;
  summary: string;
  date: string;
  updatedAt: string;
  lastSmartUpdateAt?: string | null;
  promptBody?: string | null;
  promptFormat?: string | null;
  category: "content" | "journal";
  linkUrl?: string | null;
  thumbnailUrl?: string | null;
  videoId?: string | null;
  videoType?: "short" | "live" | "video" | null;
  pinned: boolean;
  archived?: boolean;
  tags?: string[];
}

/**
 * ActivityItem shape used by frontend components.
 * Fields are identical to Entry, but nullable fields are converted to undefined.
 */
export interface ActivityItem {
  id: string;
  title: string;
  summary: string;
  date: string;
  createdAt?: string;
  updatedAt?: string;
  lastSmartUpdateAt?: string | null;
  promptBody?: string;
  promptFormat?: string;
  tags?: string[];
  category: "content" | "journal" | "conversation";
  linkUrl?: string;
  thumbnailUrl?: string;
  videoId?: string;
  videoType?: "short" | "live" | "video";
  privacyStatus?: "public" | "unlisted" | "private";
  pinned?: boolean;
  archived?: boolean;
}

/**
 * Converts an Entry (backend shape) to an ActivityItem (frontend shape).
 *
 * @param entry - Entry from the backend API
 * @returns ActivityItem for use in frontend components
 */
export function entryToActivityItem(entry: Entry): ActivityItem {
  const updatedAt = entry.updatedAt ?? entry.date;
  return {
    id: entry.id,
    title: entry.title,
    summary: entry.summary,
    date: updatedAt,
    createdAt: entry.date,
    updatedAt,
    lastSmartUpdateAt: entry.lastSmartUpdateAt ?? null,
    promptBody: entry.promptBody ?? undefined,
    promptFormat: entry.promptFormat ?? undefined,
    tags: entry.tags ?? [],
    category: entry.category,
    linkUrl: entry.linkUrl ?? undefined,
    thumbnailUrl: entry.thumbnailUrl ?? undefined,
    videoId: entry.videoId ?? undefined,
    videoType: entry.videoType ?? undefined,
    pinned: entry.pinned,
    archived: entry.archived ?? false,
  };
}

export function compareEntriesByPinnedDate(a: Entry, b: Entry): number {
  const pinnedDelta = Number(b.pinned) - Number(a.pinned);
  if (pinnedDelta !== 0) {
    return pinnedDelta;
  }
  return toTimestamp(b.updatedAt ?? b.date) - toTimestamp(a.updatedAt ?? a.date);
}

export function compareActivityItemsByPinnedDate(
  a: ActivityItem,
  b: ActivityItem,
): number {
  const aPinned = a.category === "journal" && Boolean(a.pinned);
  const bPinned = b.category === "journal" && Boolean(b.pinned);
  const pinnedDelta = Number(bPinned) - Number(aPinned);
  if (pinnedDelta !== 0) {
    return pinnedDelta;
  }
  return toTimestamp(b.updatedAt ?? b.date) - toTimestamp(a.updatedAt ?? a.date);
}

function toTimestamp(value: string): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}
