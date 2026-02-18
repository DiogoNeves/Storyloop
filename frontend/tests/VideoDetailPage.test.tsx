import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VideoDetailPage } from "@/pages/VideoDetailPage";
import { AgentConversationProvider } from "@/context/AgentConversationContext";
import { SettingsProvider } from "@/context/SettingsProvider";
import { SyncProvider } from "@/context/SyncProvider";
import { TooltipProvider } from "@/components/ui/tooltip";

const apiGetMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/LoopiePanel", () => ({
  LoopiePanel: () => <div data-testid="agent-panel" />,
}));

vi.mock("@/api/client", () => ({
  apiClient: {
    get: apiGetMock,
  },
  API_BASE_URL: "http://localhost:8000",
}));

const sampleVideo = {
  id: "video-1",
  title: "Long-form content walkthrough",
  description: "00:00 Intro\n01:12 Demo",
  transcript: "Transcript sample",
  publishedAt: "2026-02-17T10:00:00Z",
  url: "https://youtube.com/watch?v=video-1",
  thumbnailUrl: null,
  videoType: "video" as const,
  privacyStatus: "public" as const,
  statistics: {
    viewCount: 1200,
    likeCount: 100,
    commentCount: 8,
  },
};

function renderPage(ui: ReactElement, initialPath = "/videos/video-1") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SyncProvider>
        <TooltipProvider>
          <AgentConversationProvider>
            <MemoryRouter initialEntries={[initialPath]}>
              <SettingsProvider>
                <Routes>
                  <Route path="/videos/:videoId" element={ui} />
                </Routes>
              </SettingsProvider>
            </MemoryRouter>
          </AgentConversationProvider>
        </TooltipProvider>
      </SyncProvider>
    </QueryClientProvider>,
  );
}

function getCardScrollBody(collapsedHeader: HTMLElement): HTMLDivElement {
  const card = collapsedHeader.closest("section");
  if (!card) {
    throw new Error("Expected collapsed header to be inside a card section.");
  }
  const scrollBody = card.querySelector<HTMLDivElement>(".overflow-y-auto");
  if (!scrollBody) {
    throw new Error("Expected card to include a scroll body.");
  }
  return scrollBody;
}

describe("VideoDetailPage", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiGetMock.mockImplementation((url: string) => {
      if (url.startsWith("/youtube/videos/")) {
        return Promise.resolve({ data: sampleVideo });
      }
      if (url === "/youtube/auth/status") {
        return Promise.resolve({
          data: {
            linked: false,
            refreshNeeded: false,
            channel: null,
            statusMessage: null,
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it("renders the mobile back-header replacement with title", async () => {
    renderPage(<VideoDetailPage />);

    expect(
      await screen.findByRole("heading", { name: sampleVideo.title }),
    ).toBeInTheDocument();
    const backLinks = screen.getAllByRole("link", {
      name: /Back to activity feed/i,
    });
    expect(
      backLinks.some((link) => link.className.includes("h-8 w-8")),
    ).toBe(true);
  });

  it("collapses to the compact mobile header on card scroll", async () => {
    renderPage(<VideoDetailPage />);

    const collapsedHeader = await screen.findByTestId("mobile-collapsed-header");
    expect(collapsedHeader).toHaveAttribute("aria-hidden", "true");
    expect(within(collapsedHeader).getByText(sampleVideo.title)).toBeInTheDocument();

    const scrollBody = getCardScrollBody(collapsedHeader);
    Object.defineProperty(scrollBody, "scrollTop", {
      value: 72,
      writable: true,
      configurable: true,
    });
    fireEvent.scroll(scrollBody);

    expect(collapsedHeader).toHaveAttribute("aria-hidden", "false");
  });
});
