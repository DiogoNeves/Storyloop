import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import {
  ActivityFeed,
  LAST_CHANNEL_STORAGE_KEY,
  type ActivityItem,
} from "@/components/ActivityFeed";
import {
  YoutubeApiError,
  type YoutubeFeedResponse,
} from "@/api/youtube";

const fetchChannelVideosMock = vi.fn<
  [string],
  Promise<YoutubeFeedResponse>
>();

vi.mock("@/api/youtube", async () => {
  const actual = await vi.importActual<typeof import("@/api/youtube")>(
    "@/api/youtube",
  );
  return {
    ...actual,
    youtubeApi: {
      fetchChannelVideos: (channel: string) => fetchChannelVideosMock(channel),
    },
  };
});

describe("ActivityFeed", () => {
  beforeEach(() => {
    fetchChannelVideosMock.mockReset();
    window.localStorage.clear();
  });

  it("shows a loading state while entries are being fetched", () => {
    render(<ActivityFeed items={[]} isLoadingEntries />);

    expect(screen.getByTestId("activity-loading")).toBeInTheDocument();
  });

  it("renders an empty state when there is no activity", () => {
    render(<ActivityFeed items={[]} />);

    expect(screen.getByTestId("activity-empty")).toBeInTheDocument();
    expect(screen.getByText(/No activity yet/i)).toBeInTheDocument();
  });

  it("persists the selected channel and separates journal entries from videos", async () => {
    const items: ActivityItem[] = [
      {
        id: "entry-1",
        title: "Journal reflection",
        summary: "Testing new pacing strategies.",
        date: new Date("2024-01-22T12:00:00Z").toISOString(),
        category: "journal",
      },
    ];

    fetchChannelVideosMock.mockResolvedValue({
      channelId: "channel-123",
      channelTitle: "Storyloop",
      channelDescription: null,
      channelUrl: "https://youtube.com/@storyloop",
      channelThumbnailUrl: null,
      videos: [
        {
          id: "video-1",
          title: "Behind the scenes",
          description: "Editing deep dive",
          publishedAt: new Date("2024-01-24T10:00:00Z").toISOString(),
          url: "https://youtube.com/watch?v=video-1",
          thumbnailUrl: null,
        },
      ],
    });

    render(<ActivityFeed items={items} />);

    const input = screen.getByLabelText(/YouTube channel/i);
    fireEvent.change(input, { target: { value: "  @Storyloop  " } });
    fireEvent.click(screen.getByRole("button", { name: /Load videos/i }));

    await waitFor(() =>
      expect(screen.getByText(/Behind the scenes/i)).toBeInTheDocument(),
    );

    expect(screen.getByTestId("section-divider-journal")).toBeInTheDocument();
    expect(screen.getByTestId("section-divider-video")).toBeInTheDocument();
    expect(window.localStorage.getItem(LAST_CHANNEL_STORAGE_KEY)).toBe(
      "@Storyloop",
    );
  });

  it("hydrates the last successful channel selection on mount", async () => {
    window.localStorage.setItem(LAST_CHANNEL_STORAGE_KEY, "@hydrated");

    fetchChannelVideosMock.mockResolvedValue({
      channelId: "channel-999",
      channelTitle: "Hydrated Channel",
      channelDescription: null,
      channelUrl: "https://youtube.com/@hydrated",
      channelThumbnailUrl: null,
      videos: [
        {
          id: "video-42",
          title: "Hydrated upload",
          description: "Automatic fetch",
          publishedAt: new Date("2024-01-25T09:30:00Z").toISOString(),
          url: "https://youtube.com/watch?v=video-42",
          thumbnailUrl: null,
        },
      ],
    });

    render(<ActivityFeed items={[]} />);

    await waitFor(() =>
      expect(fetchChannelVideosMock).toHaveBeenCalledWith("@hydrated"),
    );
    await waitFor(() =>
      expect(screen.getByText(/Hydrated upload/i)).toBeInTheDocument(),
    );

    expect(screen.getByLabelText(/YouTube channel/i)).toHaveValue("@hydrated");
  });

  it("surfaces API errors when the channel lookup fails", async () => {
    fetchChannelVideosMock.mockRejectedValue(
      new YoutubeApiError(
        "We couldn’t find that channel on YouTube.",
        "not_found",
        404,
      ),
    );

    render(<ActivityFeed items={[]} />);

    fireEvent.change(screen.getByLabelText(/YouTube channel/i), {
      target: { value: "@missing" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Load videos/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/We couldn’t find that channel on YouTube\./i),
      ).toBeInTheDocument(),
    );
  });
});
