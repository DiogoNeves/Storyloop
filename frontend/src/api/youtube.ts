import { isAxiosError } from "axios";

import { apiClient } from "@/api/client";

export interface YoutubeVideoResponse {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  url: string;
  thumbnailUrl: string | null;
}

export interface YoutubeFeedResponse {
  channelId: string;
  channelTitle: string;
  channelDescription: string | null;
  channelUrl: string;
  channelThumbnailUrl: string | null;
  videos: YoutubeVideoResponse[];
}

export type YoutubeApiErrorCode =
  | "not_found"
  | "not_configured"
  | "request_failed"
  | "unknown";

export class YoutubeApiError extends Error {
  constructor(
    message: string,
    public code: YoutubeApiErrorCode,
    public status?: number,
  ) {
    super(message);
    this.name = "YoutubeApiError";
  }
}

function extractErrorDetail(data: unknown): string | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  if ("detail" in data && typeof (data as { detail: unknown }).detail === "string") {
    return (data as { detail: string }).detail;
  }

  return null;
}

export async function fetchChannelVideos(channel: string) {
  try {
    const response = await apiClient.get<YoutubeFeedResponse>("/youtube/videos", {
      params: { channel },
    });
    return response.data;
  } catch (error: unknown) {
    if (isAxiosError(error)) {
      const status = error.response?.status;
      const detail = extractErrorDetail(error.response?.data);

      if (status === 404) {
        throw new YoutubeApiError(
          detail ?? "We couldn’t find that channel on YouTube.",
          "not_found",
          status,
        );
      }

      if (status === 503) {
        throw new YoutubeApiError(
          detail ?? "The server hasn’t been configured for YouTube yet.",
          "not_configured",
          status,
        );
      }

      throw new YoutubeApiError(
        detail ?? "We couldn’t load videos from YouTube.",
        "request_failed",
        status,
      );
    }

    throw new YoutubeApiError(
      "We couldn’t load videos from YouTube.",
      "unknown",
    );
  }
}

export const youtubeApi = {
  fetchChannelVideos,
};
