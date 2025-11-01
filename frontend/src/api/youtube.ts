import { apiClient } from "@/api/client";

export interface YoutubeVideoResponse {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  url: string;
  thumbnailUrl: string | null;
  videoType: "short" | "live" | "video";
}

export interface YoutubeFeedResponse {
  channelId: string;
  channelTitle: string;
  channelDescription: string | null;
  channelUrl: string;
  channelThumbnailUrl: string | null;
  videos: YoutubeVideoResponse[];
  metrics?: YoutubeVideoMetricsResponse[];
}

export interface YoutubeVideoMetricsResponse {
  videoId: string;
  views: number;
  impressions: number;
  ctr: number;
  averageViewDurationSeconds: number;
  videoLengthSeconds: number;
  score: number;
  publishedAt: string;
}

export interface YoutubeMetricsResponse {
  channelId: string;
  metrics: YoutubeVideoMetricsResponse[];
}

export async function fetchChannelVideos(
  channel: string,
  oauthToken?: string,
) {
  const response = await apiClient.get<YoutubeFeedResponse>("/youtube/videos", {
    params: {
      channel,
      ...(oauthToken && { oauthToken }),
    },
  });
  return response.data;
}

export async function fetchChannelMetrics(
  channel: string,
  oauthToken?: string,
) {
  const response = await apiClient.get<YoutubeMetricsResponse>(
    "/youtube/metrics",
    {
      params: {
        channel,
        ...(oauthToken && { oauthToken }),
      },
    },
  );
  return response.data;
}

export const youtubeApi = {
  fetchChannelVideos,
  fetchChannelMetrics,
};
