import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useYouTubeFeed } from "@/hooks/useYouTubeFeed";

interface WrapperProps {
  children: ReactNode;
}

const linkStatusMock = vi.fn();
const fetchChannelVideosMock = vi.fn();

vi.mock("@/api/youtube", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/youtube")>();
  return {
    ...actual,
    youtubeApi: {
      ...actual.youtubeApi,
      linkStatus: () => Promise.resolve(linkStatusMock()),
      fetchChannelVideos: (
        channel: string,
        videoType?: "short" | "video" | "live" | null,
      ) => Promise.resolve(fetchChannelVideosMock(channel, videoType)),
    },
    youtubeQueries: {
      ...actual.youtubeQueries,
      authStatus: () => ({
        queryKey: ["youtube", "auth", "status"],
        queryFn: () => Promise.resolve(linkStatusMock()),
      }),
      channelVideos: (
        channel: string,
        videoType?: "short" | "video" | "live" | null,
      ) => ({
        queryKey: ["youtube", "channels", channel, "videos", videoType ?? "all"],
        queryFn: () => Promise.resolve(fetchChannelVideosMock(channel, videoType)),
      }),
    },
  };
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: WrapperProps) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useYouTubeFeed", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the unfiltered feed then refetches when a filter is applied while keeping channel metadata", async () => {
    linkStatusMock.mockResolvedValue({
      linked: true,
      refreshNeeded: false,
      channel: {
        id: "UC123",
        title: "Storyloop",
        url: "https://www.youtube.com/channel/UC123",
        thumbnailUrl: "https://img.youtube.com/123.jpg",
        updatedAt: "2024-01-01T00:00:00Z",
      },
      statusMessage: null,
    });

    const unfilteredFeed = {
      channelId: "UC123",
      channelTitle: "Storyloop",
      channelDescription: "Description",
      channelUrl: "https://www.youtube.com/channel/UC123",
      channelThumbnailUrl: "https://img.youtube.com/123.jpg",
      videos: [
        {
          id: "v1",
          title: "Long form",
          description: "",
          publishedAt: "2024-01-01T00:00:00Z",
          url: "https://youtube.com/watch?v=v1",
          thumbnailUrl: null,
          videoType: "video" as const,
          privacyStatus: "public" as const,
        },
      ],
    };

    const filteredFeed = {
      ...unfilteredFeed,
      videos: [
        {
          id: "s1",
          title: "Short form",
          description: "",
          publishedAt: "2024-02-01T00:00:00Z",
          url: "https://youtube.com/shorts/s1",
          thumbnailUrl: "https://img.youtube.com/s1.jpg",
          videoType: "short" as const,
          privacyStatus: "public" as const,
        },
      ],
    };

    fetchChannelVideosMock
      .mockResolvedValueOnce(unfilteredFeed)
      .mockResolvedValueOnce(filteredFeed);

    const { result, rerender } = renderHook(
      (videoType?: "short" | "video" | "live" | null) =>
        useYouTubeFeed(videoType),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.youtubeFeed?.videos).toHaveLength(1);
    });

    expect(fetchChannelVideosMock).toHaveBeenCalledWith("UC123", null);
    expect(result.current.youtubeFeed?.channelThumbnailUrl).toBe(
      "https://img.youtube.com/123.jpg",
    );

    rerender("short");

    await waitFor(() => {
      expect(result.current.youtubeFeed?.videos[0]?.id).toBe("s1");
    });

    expect(fetchChannelVideosMock).toHaveBeenLastCalledWith("UC123", "short");
    expect(result.current.youtubeFeed?.channelThumbnailUrl).toBe(
      "https://img.youtube.com/123.jpg",
    );
  });

  it("surfaces fetch failures through youtubeError", async () => {
    linkStatusMock.mockResolvedValue({
      linked: true,
      refreshNeeded: false,
      channel: {
        id: "UC123",
        title: "Storyloop",
        url: "https://www.youtube.com/channel/UC123",
        thumbnailUrl: null,
        updatedAt: "2024-01-01T00:00:00Z",
      },
      statusMessage: null,
    });

    fetchChannelVideosMock.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useYouTubeFeed("video"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.youtubeError).toBe("boom");
    });
  });

  it("reuses cached results when rerendered with the same filter", async () => {
    linkStatusMock.mockResolvedValue({
      linked: true,
      refreshNeeded: false,
      channel: {
        id: "UC123",
        title: "Storyloop",
        url: "https://www.youtube.com/channel/UC123",
        thumbnailUrl: null,
        updatedAt: "2024-01-01T00:00:00Z",
      },
      statusMessage: null,
    });

    const feed = {
      channelId: "UC123",
      channelTitle: "Storyloop",
      channelDescription: "Description",
      channelUrl: "https://www.youtube.com/channel/UC123",
      channelThumbnailUrl: null,
      videos: [
        {
          id: "v1",
          title: "Only video",
          description: "",
          publishedAt: "2024-03-01T00:00:00Z",
          url: "https://youtube.com/watch?v=v1",
          thumbnailUrl: null,
          videoType: "video" as const,
          privacyStatus: "public" as const,
        },
      ],
    };

    fetchChannelVideosMock.mockResolvedValue(feed);

    const { result, rerender } = renderHook(() => useYouTubeFeed("video"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.youtubeFeed?.videos[0]?.id).toBe("v1");
    });

    expect(fetchChannelVideosMock).toHaveBeenCalledTimes(1);

    rerender();

    await waitFor(() => {
      expect(result.current.youtubeFeed?.videos[0]?.id).toBe("v1");
    });

    expect(fetchChannelVideosMock).toHaveBeenCalledTimes(1);
  });
});
