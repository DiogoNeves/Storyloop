import { useState, useCallback, useEffect } from "react";
import { isAxiosError } from "axios";

import {
  youtubeApi,
  type YoutubeFeedResponse,
  type YoutubeMetricsResponse,
} from "@/api/youtube";

const YOUTUBE_OAUTH_TOKEN_KEY = "youtube_oauth_token";

/**
 * Hook for managing YouTube channel feed state and operations.
 *
 * Encapsulates the state and logic for fetching and displaying YouTube videos
 * and their analytics metrics.
 */
export function useYouTubeFeed() {
  const [channelInput, setChannelInput] = useState("");
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [youtubeFeed, setYoutubeFeed] = useState<YoutubeFeedResponse | null>(
    null,
  );
  const [youtubeMetrics, setYoutubeMetrics] =
    useState<YoutubeMetricsResponse | null>(null);

  // Load OAuth token from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(YOUTUBE_OAUTH_TOKEN_KEY);
    if (storedToken) {
      // Token is available, but we don't set it in state - just use it when fetching
    }
  }, []);

  const handleFetchVideos = useCallback(
    async (oauthToken?: string) => {
      const trimmed = channelInput.trim();
      if (!trimmed) {
        setYoutubeError("Enter a YouTube channel handle, link, or ID.");
        return;
      }

      setIsLoadingVideos(true);
      setIsLoadingMetrics(true);
      setYoutubeError(null);

      // Try to get OAuth token from parameter, localStorage, or environment
      const token =
        oauthToken ||
        localStorage.getItem(YOUTUBE_OAUTH_TOKEN_KEY) ||
        undefined;

      try {
        // Fetch videos (metrics included if OAuth token provided)
        const feed = await youtubeApi.fetchChannelVideos(trimmed, token || undefined);

        console.log("[useYouTubeFeed] Feed received:", {
          hasMetrics: !!feed.metrics,
          metricsLength: feed.metrics?.length ?? 0,
          oauthTokenProvided: !!token,
        });

        setYoutubeFeed(feed);

        // Extract metrics from feed if present
        // Note: metrics array is always present in response (even if empty)
        if (feed.metrics && Array.isArray(feed.metrics) && feed.metrics.length > 0) {
          console.log("[useYouTubeFeed] Setting metrics:", feed.metrics.length, "items");
          setYoutubeMetrics({
            channelId: feed.channelId,
            metrics: feed.metrics,
          });
        } else {
          // No metrics available (empty array or missing)
          console.log("[useYouTubeFeed] No metrics available");
          setYoutubeMetrics(null);
        }
      } catch (error) {
        if (isAxiosError(error)) {
          const status = error.response?.status;
          const data = error.response?.data as unknown;
          const detail =
            typeof data === "object" &&
            data !== null &&
            "detail" in data &&
            typeof (data as { detail: unknown }).detail === "string"
              ? (data as { detail: string }).detail
              : null;
          if (status === 404) {
            setYoutubeError(
              detail ?? "We couldn't find that channel on YouTube.",
            );
          } else if (status === 503) {
            setYoutubeError(
              detail ?? "The server hasn't been configured for YouTube yet.",
            );
          } else {
            setYoutubeError(detail ?? "We couldn't load videos from YouTube.");
          }
        } else {
          setYoutubeError("We couldn't load videos from YouTube.");
        }
        setYoutubeFeed(null);
        setYoutubeMetrics(null);
      } finally {
        setIsLoadingVideos(false);
        setIsLoadingMetrics(false);
      }
    },
    [channelInput],
  );

  const handleChannelKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void handleFetchVideos();
      }
    },
    [handleFetchVideos],
  );

  return {
    channelInput,
    setChannelInput,
    isLoadingVideos,
    isLoadingMetrics,
    youtubeError,
    youtubeFeed,
    youtubeMetrics,
    handleFetchVideos,
    handleChannelKeyDown,
  };
}
