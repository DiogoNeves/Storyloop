import { useState, useCallback } from "react";
import { isAxiosError } from "axios";

import {
  youtubeApi,
  type YoutubeFeedResponse,
  type YoutubeMetricsResponse,
} from "@/api/youtube";

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

  const handleFetchVideos = useCallback(async () => {
    const trimmed = channelInput.trim();
    if (!trimmed) {
      setYoutubeError("Enter a YouTube channel handle, link, or ID.");
      return;
    }

    setIsLoadingVideos(true);
    setIsLoadingMetrics(true);
    setYoutubeError(null);

    try {
      // Fetch videos and metrics in parallel
      const [feed, metrics] = await Promise.allSettled([
        youtubeApi.fetchChannelVideos(trimmed),
        youtubeApi.fetchChannelMetrics(trimmed).catch(() => {
          // Metrics fetch failure is non-blocking
          // Return null to indicate no metrics available
          return null;
        }),
      ]);

      // Handle videos result
      if (feed.status === "fulfilled") {
        setYoutubeFeed(feed.value);
      } else {
        const error = feed.reason;
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
      }

      // Handle metrics result (non-blocking)
      if (metrics.status === "fulfilled" && metrics.value) {
        setYoutubeMetrics(metrics.value);
      } else {
        // Metrics fetch failed or not available - silently continue
        setYoutubeMetrics(null);
      }
    } catch (error) {
      // This should not happen with Promise.allSettled, but handle just in case
      setYoutubeError("We couldn't load videos from YouTube.");
      setYoutubeFeed(null);
      setYoutubeMetrics(null);
    } finally {
      setIsLoadingVideos(false);
      setIsLoadingMetrics(false);
    }
  }, [channelInput]);

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

