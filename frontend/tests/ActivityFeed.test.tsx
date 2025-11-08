import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";

import { ActivityFeed } from "@/components/ActivityFeed";
import type { ActivityItem } from "@/components/ActivityFeed";
import type { YoutubeFeedResponse } from "@/api/youtube";

// Mock the YouTube feed hook
const mockUseYouTubeFeed = vi.fn();
vi.mock("@/hooks/useYouTubeFeed", () => ({
  useYouTubeFeed: () => mockUseYouTubeFeed(),
}));

// Mock the entry editing hook
vi.mock("@/hooks/useEntryEditing", () => ({
  useEntryEditing: () => ({
    editingEntryId: null,
    editingDraft: null,
    handleEditDraftChange: vi.fn(),
    cancelEdit: vi.fn(),
    submitEdit: vi.fn(),
    startEdit: vi.fn(),
    deleteEntry: vi.fn(),
    isUpdating: false,
    isDeleting: () => false,
  }),
}));

describe("ActivityFeed", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    mockUseYouTubeFeed.mockReturnValue({
      youtubeFeed: null,
      youtubeError: null,
      isLoading: false,
      isLinked: false,
      linkStatus: null,
    });
  });

  const renderActivityFeed = (items: ActivityItem[]) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ActivityFeed items={items} />
      </QueryClientProvider>,
    );
  };

  it("sorts items by date descending", () => {
    const items: ActivityItem[] = [
      {
        id: "1",
        title: "Older entry",
        summary: "Summary",
        date: "2024-01-01T00:00:00Z",
        category: "journal",
      },
      {
        id: "2",
        title: "Newer entry",
        summary: "Summary",
        date: "2024-01-02T00:00:00Z",
        category: "journal",
      },
      {
        id: "3",
        title: "Middle entry",
        summary: "Summary",
        date: "2024-01-01T12:00:00Z",
        category: "journal",
      },
    ];

    renderActivityFeed(items);

    const renderedItems = screen.getAllByText(/entry/i);
    // Should be sorted: Newer, Middle, Older
    expect(renderedItems[0]).toHaveTextContent("Newer entry");
    expect(renderedItems[1]).toHaveTextContent("Middle entry");
    expect(renderedItems[2]).toHaveTextContent("Older entry");
  });

  it("merges and sorts journal entries with YouTube videos", () => {
    const items: ActivityItem[] = [
      {
        id: "1",
        title: "Journal entry",
        summary: "Summary",
        date: "2024-01-01T00:00:00Z",
        category: "journal",
      },
    ];

    const youtubeFeed: YoutubeFeedResponse = {
      channelId: "UC123",
      channelTitle: "Test Channel",
      channelDescription: null,
      channelUrl: "https://youtube.com/channel/UC123",
      channelThumbnailUrl: null,
      videos: [
        {
          id: "vid1",
          title: "Video 1",
          description: "Description",
          publishedAt: "2024-01-02T00:00:00Z",
          url: "https://youtube.com/watch?v=vid1",
          thumbnailUrl: null,
          videoType: "video",
        },
        {
          id: "vid2",
          title: "Video 2",
          description: "Description",
          publishedAt: "2024-01-01T12:00:00Z",
          url: "https://youtube.com/watch?v=vid2",
          thumbnailUrl: null,
          videoType: "short",
        },
      ],
    };

    mockUseYouTubeFeed.mockReturnValue({
      youtubeFeed,
      youtubeError: null,
      isLoading: false,
      isLinked: true,
      linkStatus: { linked: true, refreshNeeded: false, channel: null },
    });

    renderActivityFeed(items);

    const renderedItems = screen.getAllByText(/entry|Video/i);
    // Should be sorted: Video 1 (newest), Video 2, Journal entry (oldest)
    expect(renderedItems[0]).toHaveTextContent("Video 1");
    expect(renderedItems[1]).toHaveTextContent("Video 2");
    expect(renderedItems[2]).toHaveTextContent("Journal entry");
  });

  it("maintains stable sort order when videos arrive after journal entries", () => {
    const items: ActivityItem[] = [
      {
        id: "1",
        title: "Journal entry",
        summary: "Summary",
        date: "2024-01-01T12:00:00Z",
        category: "journal",
      },
    ];

    // First render without videos
    const { rerender } = renderActivityFeed(items);

    // Then videos arrive
    const youtubeFeed: YoutubeFeedResponse = {
      channelId: "UC123",
      channelTitle: "Test Channel",
      channelDescription: null,
      channelUrl: "https://youtube.com/channel/UC123",
      channelThumbnailUrl: null,
      videos: [
        {
          id: "vid1",
          title: "Video 1",
          description: "Description",
          publishedAt: "2024-01-02T00:00:00Z",
          url: "https://youtube.com/watch?v=vid1",
          thumbnailUrl: null,
          videoType: "video",
        },
      ],
    };

    mockUseYouTubeFeed.mockReturnValue({
      youtubeFeed,
      youtubeError: null,
      isLoading: false,
      isLinked: true,
      linkStatus: { linked: true, refreshNeeded: false, channel: null },
    });

    rerender(
      <QueryClientProvider client={queryClient}>
        <ActivityFeed items={items} />
      </QueryClientProvider>,
    );

    const renderedItems = screen.getAllByText(/entry|Video/i);
    // Video should appear first (newer), then journal entry
    expect(renderedItems[0]).toHaveTextContent("Video 1");
    expect(renderedItems[1]).toHaveTextContent("Journal entry");
  });
});

