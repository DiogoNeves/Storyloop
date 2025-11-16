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
  privacyStatus: "public" | "unlisted" | "private";
}

export interface YoutubeVideoDetailResponse extends YoutubeVideoResponse {
  transcript: string | null;
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
  statusMessage: string | null;
}

export interface YoutubeCompleteLinkRequest {
  code: string;
  state: string;
}

export interface YoutubeCompleteLinkResponse {
  success: boolean;
}

export interface YoutubeUnlinkResponse {
  success: boolean;
}

export async function fetchChannelVideos(
  channel: string,
  videoType?: "short" | "video" | "live" | null,
) {
  const params: { channel: string; videoType?: string } = { channel };
  if (videoType) {
    params.videoType = videoType;
  }
  const response = await apiClient.get<YoutubeFeedResponse>("/youtube/videos", {
    params,
  });
  return response.data;
}

export async function fetchVideoDetail(
  videoId: string,
): Promise<YoutubeVideoDetailResponse> {
  const response = await apiClient.get<YoutubeVideoDetailResponse>(
    `/youtube/videos/${videoId}`,
  );
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

export async function completeLink(
  request: YoutubeCompleteLinkRequest,
): Promise<YoutubeCompleteLinkResponse> {
  const response = await apiClient.post<YoutubeCompleteLinkResponse>(
    "/youtube/auth/complete",
    request,
  );
  return response.data;
}

export async function unlinkAccount(): Promise<YoutubeUnlinkResponse> {
  const response = await apiClient.post<YoutubeUnlinkResponse>(
    "/youtube/auth/unlink",
  );
  return response.data;
}

export const youtubeQueries = createQueryKeys("youtube", {
  authStatus: () => ({
    queryKey: ["youtube", "auth", "status"],
    queryFn: linkStatus,
  }),
  channelVideos: (
    channel: string,
    videoType?: "short" | "video" | "live" | null,
  ) => ({
    queryKey: ["youtube", "channels", channel, "videos", videoType ?? "all"],
    queryFn: () => fetchChannelVideos(channel, videoType),
  }),
  videoDetail: (videoId: string) => ({
    queryKey: ["youtube", "videos", videoId, "detail"],
    queryFn: () => fetchVideoDetail(videoId),
  }),
});

export const youtubeApi = {
  fetchChannelVideos,
  fetchVideoDetail,
  startLink,
  linkStatus,
  completeLink,
  unlinkAccount,
};
