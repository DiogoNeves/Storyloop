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
  category: "content" | "insight" | "journal";
  linkUrl?: string | null;
  thumbnailUrl?: string | null;
  videoId?: string | null;
  videoType?: "short" | "live" | "video" | null;
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
  category: "content" | "insight" | "journal" | "conversation";
  linkUrl?: string;
  thumbnailUrl?: string;
  videoId?: string;
  videoType?: "short" | "live" | "video";
  privacyStatus?: "public" | "unlisted" | "private";
}

/**
 * Converts an Entry (backend shape) to an ActivityItem (frontend shape).
 *
 * @param entry - Entry from the backend API
 * @returns ActivityItem for use in frontend components
 */
export function entryToActivityItem(entry: Entry): ActivityItem {
  return {
    id: entry.id,
    title: entry.title,
    summary: entry.summary,
    date: entry.date,
    category: entry.category,
    linkUrl: entry.linkUrl ?? undefined,
    thumbnailUrl: entry.thumbnailUrl ?? undefined,
    videoId: entry.videoId ?? undefined,
    videoType: entry.videoType ?? undefined,
  };
}
