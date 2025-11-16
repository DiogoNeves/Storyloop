import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { type Entry } from "@/api/entries";
import { JournalDetailPage } from "@/pages/JournalDetailPage";

const useYouTubeFeedMock = vi.fn();
const byIdMock = vi.fn<(id: string) => Entry>();

vi.mock("@/hooks/useYouTubeFeed", () => ({
  useYouTubeFeed: (videoType?: "short" | "video" | "live" | null) =>
    useYouTubeFeedMock(videoType),
}));

vi.mock("@/api/entries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/entries")>();
  return {
    ...actual,
    entriesQueries: {
      ...actual.entriesQueries,
      byId: (id: string) => ({
        queryKey: ["entries", id],
        queryFn: () => Promise.resolve(byIdMock(id)),
      }),
    },
  };
});

const sampleEntry: Entry = {
  id: "entry-1",
  title: "Morning walk notes",
  summary: "Thoughts captured after a walk.",
  date: "2024-05-01T12:00:00Z",
  category: "journal",
  linkUrl: null,
  thumbnailUrl: null,
};

function renderPage(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/journals/${sampleEntry.id}`]}>
        <Routes>
          <Route path="/journals/:journalId" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("JournalDetailPage", () => {
  beforeEach(() => {
    byIdMock.mockReturnValue(sampleEntry);
    useYouTubeFeedMock.mockReset();
    localStorage.clear();
  });

  it("shows the YouTube link prompt when no account is linked", async () => {
    useYouTubeFeedMock.mockReturnValue({
      youtubeFeed: null,
      youtubeError: null,
      isLoading: false,
      isLinked: false,
      linkStatus: null,
      channelId: null,
    });

    renderPage(<JournalDetailPage />);

    expect(await screen.findByText(sampleEntry.title)).toBeInTheDocument();

    const prompts = screen.getAllByText(
      /Link your YouTube account to see videos near this journal entry/i,
    );
    expect(prompts).toHaveLength(2);
  });

  it("renders adjacent video cards with contextual labels", async () => {
    const earlierVideo = {
      id: "video-early",
      title: "Earlier Upload",
      description: "",
      publishedAt: "2024-04-30T12:00:00Z",
      url: "https://youtube.com/watch?v=video-early",
      thumbnailUrl: null,
      videoType: "video" as const,
      privacyStatus: "public" as const,
    };
    const laterVideo = {
      id: "video-later",
      title: "Later Upload",
      description: "",
      publishedAt: "2024-05-02T12:00:00Z",
      url: "https://youtube.com/watch?v=video-later",
      thumbnailUrl: null,
      videoType: "video" as const,
      privacyStatus: "public" as const,
    };

    useYouTubeFeedMock.mockReturnValue({
      youtubeFeed: {
        channelId: "channel-1",
        channelTitle: "Storyloop",
        channelDescription: null,
        channelUrl: "https://youtube.com/@storyloop",
        channelThumbnailUrl: null,
        videos: [
          {
            id: "video-unlisted",
            title: "Hidden Upload",
            description: "",
            publishedAt: "2024-04-29T12:00:00Z",
            url: "https://youtube.com/watch?v=video-unlisted",
            thumbnailUrl: null,
            videoType: "video",
            privacyStatus: "unlisted",
          },
          earlierVideo,
          laterVideo,
        ],
      },
      youtubeError: null,
      isLoading: false,
      isLinked: true,
      linkStatus: {
        linked: true,
        refreshNeeded: false,
        channel: null,
        statusMessage: null,
      },
      channelId: "channel-1",
    });

    renderPage(<JournalDetailPage />);

    expect(await screen.findByText(sampleEntry.title)).toBeInTheDocument();

    const beforeLabel = screen.getByText(/Published before this journal/i);
    const beforeCard = beforeLabel.closest("a") ?? beforeLabel;
    expect(within(beforeCard).getByText(earlierVideo.title)).toBeInTheDocument();

    const afterLabel = screen.getByText(/Published after this journal/i);
    const afterCard = afterLabel.closest("a") ?? afterLabel;
    expect(within(afterCard).getByText(laterVideo.title)).toBeInTheDocument();
  });

  it("surfaces YouTube fetch errors", async () => {
    useYouTubeFeedMock.mockReturnValue({
      youtubeFeed: null,
      youtubeError: "We couldn't load channel information.",
      isLoading: false,
      isLinked: true,
      linkStatus: null,
      channelId: "channel-1",
    });

    renderPage(<JournalDetailPage />);

    expect(await screen.findByText(sampleEntry.title)).toBeInTheDocument();

    const errors = screen.getAllByText(/We couldn't load channel information./i);
    expect(errors).toHaveLength(2);
  });
});
