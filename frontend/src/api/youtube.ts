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
}

export async function fetchChannelVideos(channel: string) {
  const response = await apiClient.get<YoutubeFeedResponse>("/youtube/videos", {
    params: { channel },
  });
  return response.data;
}

export const youtubeApi = {
  fetchChannelVideos,
};
