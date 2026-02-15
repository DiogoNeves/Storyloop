import { createQueryKeys } from "@lukemorales/query-key-factory";
import { z } from "zod";

import { apiClient } from "@/api/client";

export interface YoutubeVideoStatistics {
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
}

export interface YoutubeVideoResponse {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  url: string;
  thumbnailUrl: string | null;
  videoType: "short" | "live" | "video";
  privacyStatus: "public" | "unlisted" | "private";
  tags?: string[];
  statistics?: YoutubeVideoStatistics;
}

export interface YoutubeVideoDetailResponse extends YoutubeVideoResponse {
  transcript: string | null;
  statistics?: YoutubeVideoStatistics;
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

const youtubeVideoStatisticsSchema = z.object({
  viewCount: z.number().nullable(),
  likeCount: z.number().nullable(),
  commentCount: z.number().nullable(),
});

const youtubeVideoResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  publishedAt: z.string(),
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  videoType: z.enum(["short", "live", "video"]),
  privacyStatus: z.enum(["public", "unlisted", "private"]),
  tags: z.array(z.string()).optional(),
  statistics: youtubeVideoStatisticsSchema.optional(),
});

const youtubeVideoDetailResponseSchema = youtubeVideoResponseSchema.extend({
  transcript: z.string().nullable(),
});

const youtubeFeedResponseSchema = z.object({
  channelId: z.string(),
  channelTitle: z.string(),
  channelDescription: z.string().nullable(),
  channelUrl: z.string(),
  channelThumbnailUrl: z.string().nullable(),
  videos: z.array(youtubeVideoResponseSchema),
});

const youtubeAuthStartResponseSchema = z.object({
  authorizationUrl: z.string(),
  state: z.string(),
});

const youtubeChannelLinkSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  url: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

const youtubeLinkStatusResponseSchema = z.object({
  linked: z.boolean(),
  refreshNeeded: z.boolean(),
  channel: youtubeChannelLinkSchema.nullable(),
  statusMessage: z.string().nullable(),
});

const youtubeCompleteLinkResponseSchema = z.object({
  success: z.boolean(),
});

const youtubeUnlinkResponseSchema = z.object({
  success: z.boolean(),
});

export async function fetchChannelVideos(
  channel: string,
  videoType?: "short" | "video" | "live" | null,
): Promise<YoutubeFeedResponse> {
  const params: { channel: string; videoType?: string } = { channel };
  if (videoType) {
    params.videoType = videoType;
  }
  const response = await apiClient.get<unknown>("/youtube/videos", {
    params,
  });
  return youtubeFeedResponseSchema.parse(response.data);
}

export async function fetchVideoDetail(
  videoId: string,
): Promise<YoutubeVideoDetailResponse> {
  const response = await apiClient.get<unknown>(
    `/youtube/videos/${videoId}`,
  );
  return youtubeVideoDetailResponseSchema.parse(response.data);
}

export async function startLink(): Promise<YoutubeAuthStartResponse> {
  const response = await apiClient.post<unknown>(
    "/youtube/auth/start",
  );
  return youtubeAuthStartResponseSchema.parse(response.data);
}

export async function linkStatus(): Promise<YoutubeLinkStatusResponse> {
  const response = await apiClient.get<unknown>(
    "/youtube/auth/status",
  );
  return youtubeLinkStatusResponseSchema.parse(response.data);
}

export async function completeLink(
  request: YoutubeCompleteLinkRequest,
): Promise<YoutubeCompleteLinkResponse> {
  const response = await apiClient.post<unknown>(
    "/youtube/auth/complete",
    request,
  );
  return youtubeCompleteLinkResponseSchema.parse(response.data);
}

export async function unlinkAccount(): Promise<YoutubeUnlinkResponse> {
  const response = await apiClient.post<unknown>(
    "/youtube/auth/unlink",
  );
  return youtubeUnlinkResponseSchema.parse(response.data);
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
