import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  youtubeQueries,
  type YoutubeFeedResponse,
  type YoutubeLinkStatusResponse,
  type YoutubeMeChannelResponse,
  type YoutubeMeVideosResponse,
} from "@/api/youtube";

interface UseYouTubeFeedResult {
  youtubeFeed: YoutubeFeedResponse | null;
  youtubeError: string | null;
  isLoading: boolean;
  isLinked: boolean;
  linkStatus: YoutubeLinkStatusResponse | null;
}

/**
 * Hook for retrieving YouTube uploads for the linked account.
 *
 * Automatically loads the stored channel and surfaces a fallback message when
 * no link exists, replacing the old manual channel picker.
 *
 * Fetches channel and videos in parallel after mount when account is linked,
 * allowing UI to show persisted data immediately while fresh data loads.
 */
export function useYouTubeFeed(): UseYouTubeFeedResult {
  // First, check link status (synchronous check)
  const linkStatusQuery = useQuery(youtubeQueries.authStatus());

  const isLinked = Boolean(linkStatusQuery.data?.linked);

  // Fetch channel and videos in parallel when linked
  const channelQuery = useQuery({
    ...youtubeQueries.meChannel(),
    enabled: isLinked,
  });

  const videosQuery = useQuery({
    ...youtubeQueries.meVideos(),
    enabled: isLinked,
  });

  // Build feed response from queries
  const youtubeFeed = useMemo((): YoutubeFeedResponse | null => {
    if (!isLinked) {
      return null;
    }

    // Use persisted channel info from linkStatus if available (immediate)
    const persistedChannel = linkStatusQuery.data?.channel;

    // Prefer fresh channel data, fall back to persisted
    const channelData: YoutubeMeChannelResponse | null =
      channelQuery.data ?? persistedChannel ?? null;

    // Use videos from videos query
    const videos = videosQuery.data?.videos ?? [];

    if (!channelData && videos.length === 0) {
      return null;
    }

    return {
      channelId: channelData?.id ?? "",
      channelTitle: channelData?.title ?? null,
      channelDescription: null,
      channelUrl: channelData?.url ?? null,
      channelThumbnailUrl: channelData?.thumbnailUrl ?? null,
      videos,
    };
  }, [
    isLinked,
    linkStatusQuery.data?.channel,
    channelQuery.data,
    videosQuery.data?.videos,
  ]);

  // Combine errors from all queries
  const youtubeError = useMemo(() => {
    if (channelQuery.isError) {
      const error = channelQuery.error;
      if (error instanceof Error && error.message) {
        return error.message;
      }
      return "We couldn't load channel information from your linked YouTube account.";
    }
    if (videosQuery.isError) {
      const error = videosQuery.error;
      if (error instanceof Error && error.message) {
        return error.message;
      }
      return "We couldn't load videos from your linked YouTube channel.";
    }
    return null;
  }, [channelQuery.error, channelQuery.isError, videosQuery.error, videosQuery.isError]);

  // Loading state: true if any query is loading
  const isLoading =
    linkStatusQuery.isLoading || channelQuery.isLoading || videosQuery.isLoading;

  return {
    youtubeFeed,
    youtubeError,
    isLoading,
    isLinked,
    linkStatus: linkStatusQuery.data ?? null,
  };
}

