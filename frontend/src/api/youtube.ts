import { createQueryKeys } from "@lukemorales/query-key-factory";

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

export interface YoutubeAuthStartResponse {
  authorizationUrl: string;
  state: string;
}

export interface YoutubeChannelLink {
  id: string;
  title: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  updatedAt: string | null;
}

export interface YoutubeLinkStatusResponse {
  linked: boolean;
  refreshNeeded: boolean;
  channel: YoutubeChannelLink | null;
}

export interface YoutubeMeChannelResponse {
  id: string;
  title: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  updatedAt: string | null;
}

export interface YoutubeMeVideosResponse {
  channel: YoutubeMeChannelResponse | null;
  videos: YoutubeVideoResponse[];
}

export async function fetchChannelVideos(channel: string) {
  const response = await apiClient.get<YoutubeFeedResponse>("/youtube/videos", {
    params: { channel },
  });
  return response.data;
}

export async function startLink(): Promise<YoutubeAuthStartResponse> {
  const response = await apiClient.post<YoutubeAuthStartResponse>(
    "/youtube/auth/start",
  );
  return response.data;
}

export async function linkStatus(): Promise<YoutubeLinkStatusResponse> {
  const response = await apiClient.get<YoutubeLinkStatusResponse>(
    "/youtube/auth/status",
  );
  return response.data;
}

export async function fetchMyChannel(): Promise<YoutubeMeChannelResponse> {
  const response = await apiClient.get<YoutubeMeChannelResponse>(
    "/youtube/me/channel",
  );
  return response.data;
}

export async function fetchMyVideos(): Promise<YoutubeMeVideosResponse> {
  const response = await apiClient.get<YoutubeMeVideosResponse>(
    "/youtube/me/videos",
  );
  return response.data;
}

export const youtubeQueries = createQueryKeys("youtube", {
  authStatus: () => ({
    queryKey: ["youtube", "auth", "status"],
    queryFn: linkStatus,
  }),
  channelVideos: (channel: string) => ({
    queryKey: ["youtube", "channels", channel, "videos"],
    queryFn: () => fetchChannelVideos(channel),
  }),
  meChannel: () => ({
    queryKey: ["youtube", "me", "channel"],
    queryFn: fetchMyChannel,
  }),
  meVideos: () => ({
    queryKey: ["youtube", "me", "videos"],
    queryFn: fetchMyVideos,
  }),
});

export const youtubeApi = {
  fetchChannelVideos,
  startLink,
  linkStatus,
  fetchMyChannel,
  fetchMyVideos,
};
