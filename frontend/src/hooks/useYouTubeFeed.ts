import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  youtubeApi,
  youtubeQueries,
  type YoutubeFeedResponse,
  type YoutubeLinkStatusResponse,
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
 */
export function useYouTubeFeed(): UseYouTubeFeedResult {
  const linkStatusQuery = useQuery(youtubeQueries.authStatus());

  const channelId = useMemo(() => {
    if (!linkStatusQuery.data?.linked) {
      return null;
    }
    return linkStatusQuery.data.channel?.id ?? null;
  }, [linkStatusQuery.data]);

  const videosQuery = useQuery({
    queryKey: youtubeQueries
      .channelVideos(channelId ?? "unlinked")
      .queryKey,
    queryFn: async () => {
      if (!channelId) {
        throw new Error("No linked channel available");
      }
      return youtubeApi.fetchChannelVideos(channelId);
    },
    enabled: Boolean(channelId),
  });

  const youtubeError = useMemo(() => {
    if (videosQuery.isError) {
      const error = videosQuery.error;
      if (error instanceof Error && error.message) {
        return error.message;
      }
      return "We couldn't load videos from your linked YouTube channel.";
    }
    return null;
  }, [videosQuery.error, videosQuery.isError]);

  return {
    youtubeFeed: videosQuery.data ?? null,
    youtubeError,
    isLoading: linkStatusQuery.isLoading || videosQuery.isLoading,
    isLinked: Boolean(linkStatusQuery.data?.linked),
    linkStatus: linkStatusQuery.data ?? null,
  };
}

