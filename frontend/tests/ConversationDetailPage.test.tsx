import { type ReactElement } from "react";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationDetailPage } from "@/pages/ConversationDetailPage";
import {
  mockDeleteConversation,
  mockListConversationTurns,
} from "./mocks/conversationApi";

const mockSetActiveConversation = vi.fn().mockResolvedValue(undefined);

vi.mock("@/context/AgentConversationContext", () => ({
  useAgentConversationContext: () => ({
    state: {
      conversationId: "",
      messages: [],
      composer: { status: "idle", error: null },
    },
    adapter: {
      sendMessage: vi.fn(),
      resetConversation: vi.fn(),
    },
    setActiveConversation: mockSetActiveConversation,
    isDemo: false,
  }),
}));

function renderPage(ui: ReactElement, initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/conversations/:conversationId" element={ui} />
          <Route path="/" element={<div data-testid="activity-feed" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ConversationDetailPage", () => {
  beforeEach(() => {
    mockListConversationTurns.mockReset();
    mockDeleteConversation.mockReset();
    mockSetActiveConversation.mockClear();
  });

  it("renders conversation turns and back link", async () => {
    mockListConversationTurns.mockResolvedValue([
      {
        id: "turn-1",
        role: "user",
        text: "Hello Loopie",
        createdAt: "2024-01-01T00:00:00Z",
      },
      {
        id: "turn-2",
        role: "assistant",
        text: "Hi creator!",
        createdAt: "2024-01-01T00:00:05Z",
      },
    ]);

    renderPage(<ConversationDetailPage />, "/conversations/abc");

    expect(
      await screen.findByRole("link", { name: /Back to activity feed/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Hello Loopie")).toBeInTheDocument();
    expect(await screen.findByText("Hi creator!")).toBeInTheDocument();
  });

  it("deletes the conversation and navigates home", async () => {
    mockListConversationTurns.mockResolvedValue([
      {
        id: "turn-1",
        role: "user",
        text: "Hello Loopie",
        createdAt: "2024-01-01T00:00:00Z",
      },
    ]);
    mockDeleteConversation.mockResolvedValue(undefined);

    renderPage(<ConversationDetailPage />, "/conversations/xyz");

    const deleteButton = await screen.findByRole("button", {
      name: /Delete conversation/i,
    });
    deleteButton.click();

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
});
