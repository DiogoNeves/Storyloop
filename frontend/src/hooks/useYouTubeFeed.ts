import { useState, useCallback } from "react";
import { isAxiosError } from "axios";

import { youtubeApi, type YoutubeFeedResponse } from "@/api/youtube";

/**
 * Hook for managing YouTube channel feed state and operations.
 * 
 * Encapsulates the state and logic for fetching and displaying YouTube videos.
 */
export function useYouTubeFeed() {
  const [channelInput, setChannelInput] = useState("");
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [youtubeFeed, setYoutubeFeed] = useState<YoutubeFeedResponse | null>(
    null,
  );

  const handleFetchVideos = useCallback(async () => {
    const trimmed = channelInput.trim();
    if (!trimmed) {
      setYoutubeError("Enter a YouTube channel handle, link, or ID.");
      return;
    }

    setIsLoadingVideos(true);
    setYoutubeError(null);

    try {
      const feed = await youtubeApi.fetchChannelVideos(trimmed);
      setYoutubeFeed(feed);
    } catch (error: unknown) {
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
    } finally {
      setIsLoadingVideos(false);
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
    youtubeError,
    youtubeFeed,
    handleFetchVideos,
    handleChannelKeyDown,
  };
}

