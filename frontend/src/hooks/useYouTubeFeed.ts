import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  youtubeApi,
  youtubeQueries,
  type YoutubeFeedResponse,
  type YoutubeLinkStatusResponse,
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
  const filteredVideosEnabled =
    Boolean(channelId) && videoType !== null && videoType !== undefined;

  const fullFeedQueryEnabled = Boolean(channelId) && !filteredVideosEnabled;

  const fullFeedQuery = useQuery<YoutubeFeedResponse>({
    queryKey: ["youtube", "channels", channelId ?? "unlinked", "feed"],
    queryFn: async () => {
      if (!channelId) {
        throw new Error("No linked channel available");
      }
      return youtubeApi.fetchChannelVideos(channelId, null);
    },
    enabled: fullFeedQueryEnabled,
    staleTime: Infinity, // Channel info doesn't change, cache forever
  });

  // Fetch filtered feed when a filter is applied
  const filteredFeedQuery = useQuery<YoutubeFeedResponse>({
    queryKey: youtubeQueries.channelVideos(channelId ?? "unlinked", videoType)
      .queryKey,
    queryFn: async () => {
      if (!channelId) {
        throw new Error("No linked channel available");
      }
      return youtubeApi.fetchChannelVideos(channelId, videoType);
    },
    enabled: filteredVideosEnabled,
  });

  // Combine cached channel info with filtered videos
  const youtubeFeed = useMemo<YoutubeFeedResponse | null>(() => {
    const sourceFeed = filteredFeedQuery.data ?? fullFeedQuery.data;
    if (!sourceFeed) {
      return null;
    }

    // Extract channel info from whichever feed resolved first
    const channelInfo: YoutubeChannelInfo = {
      channelId: sourceFeed.channelId,
      channelTitle: sourceFeed.channelTitle,
      channelDescription: sourceFeed.channelDescription,
      channelUrl: sourceFeed.channelUrl,
      channelThumbnailUrl: sourceFeed.channelThumbnailUrl,
    };

    // Use filtered videos if available; otherwise fall back to the cached feed
    const videos =
      filteredFeedQuery.data?.videos ?? fullFeedQuery.data?.videos ?? [];
    const videosArray = Array.isArray(videos) ? videos : [];

    return {
      ...channelInfo,
      videos: videosArray,
    };
  }, [filteredFeedQuery.data, fullFeedQuery.data]);

  const youtubeError = useMemo(() => {
    if (fullFeedQuery.isError) {
      const error = fullFeedQuery.error;
      if (error instanceof Error && error.message) {
        return error.message;
      }
      return "We couldn't load channel information.";
    }
    if (filteredFeedQuery.isError) {
      const error = filteredFeedQuery.error;
      if (error instanceof Error && error.message) {
        return error.message;
      }
      return "We couldn't load videos from your linked YouTube channel.";
    }
    return null;
  }, [
    fullFeedQuery.error,
    fullFeedQuery.isError,
    filteredFeedQuery.error,
    filteredFeedQuery.isError,
  ]);

  return {
    youtubeFeed,
    youtubeError,
    isLoading:
      linkStatusQuery.isLoading ||
      (fullFeedQueryEnabled && fullFeedQuery.isLoading) ||
      (filteredVideosEnabled && filteredFeedQuery.isLoading),
    isLinked: Boolean(linkStatusQuery.data?.linked),
    linkStatus: linkStatusQuery.data ?? null,
    channelId,
  };
}
