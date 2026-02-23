import { type ReactElement } from "react";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationDetailPage } from "@/pages/ConversationDetailPage";
import type { AgentMessage } from "@/lib/types/agent";
import { SyncProvider } from "@/context/SyncProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { mockDeleteConversation } from "./mocks/conversationApi";

const mockSetActiveConversation = vi.fn().mockResolvedValue(undefined);
const mockUseAgentConversationContext = vi.fn(() => ({
  state: {
    conversationId: "",
    messages: [] as AgentMessage[],
    composer: { status: "idle", error: null },
      },
  adapter: {
    sendMessage: vi.fn(),
    resetConversation: vi.fn(),
  },
  setActiveConversation: mockSetActiveConversation,
  isDemo: false,
  isInitializing: false,
}));

vi.mock("@/context/AgentConversationContext", () => ({
  useAgentConversationContext: () => mockUseAgentConversationContext(),
}));

vi.mock("@/api/entries", () => ({
  entriesQueries: {
    all: () => ({
      queryKey: ["entries"],
      queryFn: () =>
        Promise.resolve([
          {
            id: "entry-mention",
            title: "Launch retrospective",
            summary: "Journal summary",
            date: "2026-02-20T00:00:00.000Z",
            updatedAt: "2026-02-20T00:00:00.000Z",
            category: "journal",
            pinned: false,
            archived: false,
            tags: [],
          },
        ]),
    }),
  },
}));

import { SettingsContext } from "@/context/SettingsContext";

function renderPage(ui: ReactElement, initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const mockSettings = {
    publicOnly: false,
    setPublicOnly: vi.fn(),
    themePreference: "system" as const,
    setThemePreference: vi.fn(),
    resolvedTheme: "light" as const,
    accentPreference: "crimson" as const,
    setAccentPreference: vi.fn(),
    isAccentUpdating: false,
    accentUpdateError: null,
  };

  render(
    <QueryClientProvider client={queryClient}>
      <SyncProvider>
        <TooltipProvider>
          <SettingsContext.Provider value={mockSettings}>
            <MemoryRouter initialEntries={[initialPath]}>
              <Routes>
                <Route path="/conversations/:conversationId" element={ui} />
                <Route path="/" element={<div data-testid="activity-feed" />} />
              </Routes>
            </MemoryRouter>
          </SettingsContext.Provider>
        </TooltipProvider>
      </SyncProvider>
    </QueryClientProvider>,
  );
}

function getCardScrollBody(collapsedHeader: HTMLElement): HTMLDivElement {
  const card = collapsedHeader.closest("section");
  if (!card) {
    throw new Error("Expected collapsed header to be rendered in a card.");
  }
  const scrollBody = card.querySelector<HTMLDivElement>(".overflow-y-auto");
  if (!scrollBody) {
    throw new Error("Expected card to include a scroll body.");
  }
  return scrollBody;
}

describe("ConversationDetailPage", () => {
  beforeEach(() => {
    mockDeleteConversation.mockReset();
    mockSetActiveConversation.mockClear();
    mockUseAgentConversationContext.mockClear();
  });

  it("renders conversation turns and back link", async () => {
    mockUseAgentConversationContext.mockReturnValue({
      state: {
        conversationId: "abc",
        messages: [
          {
            id: "turn-1",
            role: "user",
            content: "Hello Loopie",
            createdAt: "2024-01-01T00:00:00Z",
          },
          {
            id: "turn-2",
            role: "assistant",
            content: "Hi creator!",
            createdAt: "2024-01-01T00:00:05Z",
          },
        ],
        composer: { status: "idle", error: null },
              },
      adapter: {
        sendMessage: vi.fn(),
        resetConversation: vi.fn(),
      },
      setActiveConversation: mockSetActiveConversation,
      isDemo: false,
      isInitializing: false,
    });

    renderPage(<ConversationDetailPage />, "/conversations/abc");

    const backLinks = await screen.findAllByRole("link", {
      name: /Back to activity feed/i,
    });
    expect(
      backLinks.some((link) => link.className.includes("h-8 w-8")),
    ).toBe(true);
    expect(await screen.findByText("Hello Loopie")).toBeInTheDocument();
    expect(await screen.findByText("Hi creator!")).toBeInTheDocument();
  });

  it("collapses to the mobile back-and-title header after scrolling", async () => {
    mockUseAgentConversationContext.mockReturnValue({
      state: {
        conversationId: "abc",
        messages: [
          {
            id: "turn-1",
            role: "user",
            content: "Hello Loopie",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
        composer: { status: "idle", error: null },
      },
      adapter: {
        sendMessage: vi.fn(),
        resetConversation: vi.fn(),
      },
      setActiveConversation: mockSetActiveConversation,
      isDemo: false,
      isInitializing: false,
    });

    renderPage(<ConversationDetailPage />, "/conversations/abc");

    const collapsedHeader = await screen.findByTestId("mobile-collapsed-header");
    expect(collapsedHeader).toHaveAttribute("aria-hidden", "true");
    expect(within(collapsedHeader).getByText(/Loopie conversation/i)).toBeInTheDocument();

    const scrollBody = getCardScrollBody(collapsedHeader);
    Object.defineProperty(scrollBody, "scrollTop", {
      value: 72,
      writable: true,
      configurable: true,
    });
    fireEvent.scroll(scrollBody);

    expect(collapsedHeader).toHaveAttribute("aria-hidden", "false");
  });

  it("deletes the conversation and navigates home", async () => {
    mockDeleteConversation.mockResolvedValue(undefined);
    mockUseAgentConversationContext.mockReturnValue({
      state: {
        conversationId: "xyz",
        messages: [
          {
            id: "turn-1",
            role: "user",
            content: "Hello Loopie",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
        composer: { status: "idle", error: null },
              },
      adapter: {
        sendMessage: vi.fn(),
        resetConversation: vi.fn(),
      },
      setActiveConversation: mockSetActiveConversation,
      isDemo: false,
      isInitializing: false,
    });

    renderPage(<ConversationDetailPage />, "/conversations/xyz");

    const user = userEvent.setup();
    const deleteButton = await screen.findByRole("button", { name: /^Delete$/i });
    await user.click(deleteButton);

    const dialog = await screen.findByRole("dialog");
    const confirmDelete = within(dialog).getByRole("button", {
      name: /Delete conversation/i,
    });
    await user.click(confirmDelete);

    await waitFor(() => {
      expect(mockDeleteConversation).toHaveBeenCalled();
      expect(mockDeleteConversation.mock.calls[0][0]).toBe("xyz");
    });
    await waitFor(() =>
      expect(
        screen.getByTestId("activity-feed"),
      ).toBeInTheDocument(),
    );
  });

  it("renders stored @entry tokens as title chips", async () => {
    mockUseAgentConversationContext.mockReturnValue({
      state: {
        conversationId: "abc",
        messages: [
          {
            id: "turn-1",
            role: "user",
            content: "Please use @entry:entry-mention for this",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
        composer: { status: "idle", error: null },
      },
      adapter: {
        sendMessage: vi.fn(),
        resetConversation: vi.fn(),
      },
      setActiveConversation: mockSetActiveConversation,
      isDemo: false,
      isInitializing: false,
    });

    renderPage(<ConversationDetailPage />, "/conversations/abc");

    expect(await screen.findByText("Launch retrospective")).toBeInTheDocument();
    expect(screen.queryByText("@entry:entry-mention")).toBeNull();
  });
});
