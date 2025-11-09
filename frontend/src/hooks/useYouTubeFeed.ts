import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  youtubeApi,
  youtubeQueries,
  type YoutubeFeedResponse,
  type YoutubeLinkStatusResponse,
  type YoutubeVideoResponse,
} from "@/api/youtube";

type YoutubeChannelInfo = Omit<YoutubeFeedResponse, "videos">;

interface UseYouTubeFeedResult {
  youtubeFeed: YoutubeFeedResponse | null;
  youtubeError: string | null;
  isLoading: boolean;
  isLinked: boolean;
  linkStatus: YoutubeLinkStatusResponse | null;
  channelId: string | null;
}

/**
 * Hook for retrieving YouTube uploads for the linked account.
 *
 * Automatically loads the stored channel and surfaces a fallback message when
 * no link exists, replacing the old manual channel picker.
 *
 * Channel info is cached separately and not refetched when videoType changes.
 * Only videos are refetched when the filter changes.
 *
 * @param videoType - Optional filter by video type ("short", "video", or "live").
 */
export function useYouTubeFeed(
  videoType?: "short" | "video" | "live" | null,
): UseYouTubeFeedResult {
  const linkStatusQuery = useQuery(youtubeQueries.authStatus());

  const channelId = useMemo(() => {
    if (!linkStatusQuery.data?.linked) {
      return null;
    }
    return linkStatusQuery.data.channel?.id ?? null;
  }, [linkStatusQuery.data]);

  // Fetch channel info once (without videoType filter) - cached separately
  const channelInfoQuery = useQuery<YoutubeChannelInfo>({
    queryKey: youtubeQueries.channelVideos(channelId ?? "unlinked", null).queryKey,
    queryFn: async () => {
      if (!channelId) {
        throw new Error("No linked channel available");
      }
      const feed = await youtubeApi.fetchChannelVideos(channelId, null);
      return {
        channelId: feed.channelId,
        channelTitle: feed.channelTitle,
        channelDescription: feed.channelDescription,
        channelUrl: feed.channelUrl,
        channelThumbnailUrl: feed.channelThumbnailUrl,
      };
    },
    enabled: Boolean(channelId),
    staleTime: Infinity, // Channel info rarely changes; cache indefinitely
  });

  // Fetch videos with filter - refetches when videoType changes
  const videosQuery = useQuery<YoutubeVideoResponse[]>({
    queryKey: youtubeQueries
      .channelVideos(channelId ?? "unlinked", videoType)
      .queryKey,
    queryFn: async () => {
      if (!channelId) {
        throw new Error("No linked channel available");
      }
      const feed = await youtubeApi.fetchChannelVideos(channelId, videoType);
      return feed.videos;
    },
    enabled: Boolean(channelId),
  });

  // Combine cached channel info with filtered videos
  const youtubeFeed = useMemo<YoutubeFeedResponse | null>(() => {
    if (!channelInfoQuery.data || !videosQuery.data) {
      return null;
    }
    return {
      ...channelInfoQuery.data,
      videos: videosQuery.data,
    };
  }, [channelInfoQuery.data, videosQuery.data]);

  const youtubeError = useMemo(() => {
    if (channelInfoQuery.isError) {
      const error = channelInfoQuery.error;
      if (error instanceof Error && error.message) {
        return error.message;
      }
      return "We couldn't load channel information.";
    }
    if (videosQuery.isError) {
      const error = videosQuery.error;
      if (error instanceof Error && error.message) {
        return error.message;
      }
      return "We couldn't load videos from your linked YouTube channel.";
    }
    return null;
  }, [
    channelInfoQuery.error,
    channelInfoQuery.isError,
    videosQuery.error,
    videosQuery.isError,
  ]);

  return {
    youtubeFeed,
    youtubeError,
    isLoading:
      linkStatusQuery.isLoading ||
      channelInfoQuery.isLoading ||
      videosQuery.isLoading,
    isLinked: Boolean(linkStatusQuery.data?.linked),
    linkStatus: linkStatusQuery.data ?? null,
    channelId,
  };
}

