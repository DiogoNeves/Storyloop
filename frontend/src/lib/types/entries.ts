import { type YoutubeVideoResponse } from "@/api/youtube";

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
  category: "video" | "insight" | "journal";
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
  category: "video" | "insight" | "journal";
  linkUrl?: string;
  thumbnailUrl?: string;
  videoId?: string;
  videoType?: "short" | "live" | "video";
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

/**
 * Converts a YouTube video to an ActivityItem.
 *
 * @param video - YouTube video from the YouTube API
 * @returns ActivityItem for use in frontend components
 */
export function youtubeVideoToActivityItem(
  video: YoutubeVideoResponse,
): ActivityItem {
  return {
    id: `youtube:${video.id}`,
    title: video.title,
    summary: video.description,
    date: video.publishedAt,
    category: "video",
    linkUrl: video.url,
    thumbnailUrl: video.thumbnailUrl ?? undefined,
    videoId: video.id,
    videoType: video.videoType,
  };
}

