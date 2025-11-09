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

  // Fetch full feed once (for channel info) - cached forever
  // Use a distinct query key to avoid collisions
  const fullFeedQuery = useQuery<YoutubeFeedResponse>({
    queryKey: ["youtube", "channels", channelId ?? "unlinked", "feed"],
    queryFn: async () => {
      if (!channelId) {
        throw new Error("No linked channel available");
      }
      return youtubeApi.fetchChannelVideos(channelId, null);
    },
    enabled: Boolean(channelId),
    staleTime: Infinity, // Channel info doesn't change, cache forever
  });

  // Fetch filtered videos - refetches when videoType changes
  const filteredVideosQuery = useQuery<YoutubeVideoResponse[]>({
    queryKey: youtubeQueries.channelVideos(channelId ?? "unlinked", videoType)
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
    if (!fullFeedQuery.data) {
      return null;
    }

    // Extract channel info from cached full feed
    const channelInfo: YoutubeChannelInfo = {
      channelId: fullFeedQuery.data.channelId,
      channelTitle: fullFeedQuery.data.channelTitle,
      channelDescription: fullFeedQuery.data.channelDescription,
      channelUrl: fullFeedQuery.data.channelUrl,
      channelThumbnailUrl: fullFeedQuery.data.channelThumbnailUrl,
    };

    // Use filtered videos if available, otherwise use videos from full feed
    const videos = filteredVideosQuery.data ?? fullFeedQuery.data.videos;
    const videosArray = Array.isArray(videos) ? videos : [];

    return {
      ...channelInfo,
      videos: videosArray,
    };
  }, [fullFeedQuery.data, filteredVideosQuery.data]);

  const youtubeError = useMemo(() => {
    if (fullFeedQuery.isError) {
      const error = fullFeedQuery.error;
      if (error instanceof Error && error.message) {
        return error.message;
      }
      return "We couldn't load channel information.";
    }
    if (filteredVideosQuery.isError) {
      const error = filteredVideosQuery.error;
      if (error instanceof Error && error.message) {
        return error.message;
      }
      return "We couldn't load videos from your linked YouTube channel.";
    }
    return null;
  }, [
    fullFeedQuery.error,
    fullFeedQuery.isError,
    filteredVideosQuery.error,
    filteredVideosQuery.isError,
  ]);

  return {
    youtubeFeed,
    youtubeError,
    isLoading:
      linkStatusQuery.isLoading ||
      fullFeedQuery.isLoading ||
      (videoType !== null && filteredVideosQuery.isLoading),
    isLinked: Boolean(linkStatusQuery.data?.linked),
    linkStatus: linkStatusQuery.data ?? null,
    channelId,
  };
}
