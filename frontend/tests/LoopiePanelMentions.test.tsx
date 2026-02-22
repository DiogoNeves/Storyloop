import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LoopieConversationContent } from "@/components/LoopiePanel";
import { SyncContext, type SyncContextValue } from "@/context/SyncContext";
import type {
  AgentConversationState,
  AgentMessageAttachment,
} from "@/lib/types/agent";

const useAudioDictationMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useAudioDictation", () => ({
  useAudioDictation: useAudioDictationMock,
}));

vi.mock("@/api/entries", () => ({
  entriesQueries: {
    all: () => ({
      queryKey: ["entries"],
      queryFn: () =>
        Promise.resolve([
          {
            id: "journal-1",
            title: "Sprint recap",
            summary: "We tested five hooks",
            date: "2026-02-20T10:00:00.000Z",
            updatedAt: "2026-02-20T10:00:00.000Z",
            category: "journal",
            pinned: false,
            archived: false,
            tags: [],
          },
          {
            id: "journal-2",
            title: "Video about Simile",
            summary: "Reference content",
            date: "2026-02-19T10:00:00.000Z",
            updatedAt: "2026-02-19T10:00:00.000Z",
            category: "journal",
            pinned: false,
            archived: false,
            tags: [],
          },
          {
            id: "journal-3",
            title: "Launch notes",
            summary: "Reference content",
            date: "2026-02-18T10:00:00.000Z",
            updatedAt: "2026-02-18T10:00:00.000Z",
            category: "journal",
            pinned: false,
            archived: false,
            tags: [],
          },
          {
            id: "journal-4",
            title: "Older note",
            summary: "Reference content",
            date: "2026-02-17T10:00:00.000Z",
            updatedAt: "2026-02-17T10:00:00.000Z",
            category: "journal",
            pinned: false,
            archived: false,
            tags: [],
          },
          {
            id: "today-1",
            title: "Today",
            summary: "- [x] not included in mentions",
            date: "2026-02-20T12:00:00.000Z",
            updatedAt: "2026-02-20T12:00:00.000Z",
            category: "today",
            pinned: false,
            archived: false,
            tags: [],
          },
        ]),
    }),
  },
}));

const syncContextValue: SyncContextValue = {
  isOnline: true,
  isOfflineSyncAvailable: true,
  pendingCount: 0,
  pendingEntries: [],
  pendingEntryUpdates: [],
  isSyncing: false,
  syncNow: vi.fn(() => Promise.resolve()),
  queueEntry: vi.fn(() => Promise.resolve()),
  queueEntryUpdate: vi.fn(() => Promise.resolve()),
  removePendingEntryUpdate: vi.fn(() => Promise.resolve()),
  markServerUnreachable: vi.fn(),
  clearSyncError: vi.fn(),
};

const state: AgentConversationState = {
  conversationId: "conversation-1",
  messages: [],
  composer: {
    status: "idle",
    error: null,
  },
};

function renderComposer(
  sendMessage = vi.fn<
    (input: string, attachments?: AgentMessageAttachment[]) => Promise<void>
  >(() => Promise.resolve()),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <SyncContext.Provider value={syncContextValue}>
        <LoopieConversationContent
          state={state}
          adapter={{
            sendMessage,
            stopResponse: vi.fn(),
            resetConversation: vi.fn(),
          }}
        />
      </SyncContext.Provider>
    </QueryClientProvider>,
  );

  return { sendMessage };
}

describe("LoopieConversationContent mentions", () => {
  it("shows journal suggestions and keeps selected references as chips", async () => {
    useAudioDictationMock.mockReturnValue({
      status: "idle",
      inputLevel: 0,
      elapsedSeconds: 0,
      isSupported: true,
      errorMessage: null,
      stopDictation: vi.fn(),
      toggleDictation: vi.fn(() => Promise.resolve()),
      clearError: vi.fn(),
    });

    const user = userEvent.setup();
    renderComposer();

    const composer = screen.getByPlaceholderText(
      /Ask about your content, growth, or next video idea/i,
    );
    await user.type(composer, "@sprint");

    await screen.findByRole("button", { name: "Sprint recap" });
    await user.click(screen.getByRole("button", { name: "Sprint recap" }));

    expect(readTextareaValue(composer).includes("@entry:journal-1")).toBe(false);
    expect(await screen.findByText("Sprint recap")).toBeInTheDocument();
  });

  it("uses Enter to select mention before sending", async () => {
    useAudioDictationMock.mockReturnValue({
      status: "idle",
      inputLevel: 0,
      elapsedSeconds: 0,
      isSupported: true,
      errorMessage: null,
      stopDictation: vi.fn(),
      toggleDictation: vi.fn(() => Promise.resolve()),
      clearError: vi.fn(),
    });

    const user = userEvent.setup();
    const { sendMessage } = renderComposer();

    const composer = screen.getByPlaceholderText(
      /Ask about your content, growth, or next video idea/i,
    );
    await user.type(composer, "@spr");
    await user.keyboard("{Enter}");

    expect(sendMessage).not.toHaveBeenCalled();
    expect(readTextareaValue(composer).includes("@entry:journal-1")).toBe(false);

    await user.keyboard("{Enter}");
    expect(sendMessage).toHaveBeenCalledWith("@entry:journal-1", []);
  });

  it("shows the latest 3 entries when typing only @", async () => {
    useAudioDictationMock.mockReturnValue({
      status: "idle",
      inputLevel: 0,
      elapsedSeconds: 0,
      isSupported: true,
      errorMessage: null,
      stopDictation: vi.fn(),
      toggleDictation: vi.fn(() => Promise.resolve()),
      clearError: vi.fn(),
    });

    const user = userEvent.setup();
    renderComposer();

    const composer = screen.getByPlaceholderText(
      /Ask about your content, growth, or next video idea/i,
    );
    await user.type(composer, "@");

    expect(await screen.findByRole("button", { name: "Sprint recap" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Video about Simile" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Launch notes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Older note" })).toBeNull();
  });

  it("syncs reference overlay offset with textarea scroll", async () => {
    useAudioDictationMock.mockReturnValue({
      status: "idle",
      inputLevel: 0,
      elapsedSeconds: 0,
      isSupported: true,
      errorMessage: null,
      stopDictation: vi.fn(),
      toggleDictation: vi.fn(() => Promise.resolve()),
      clearError: vi.fn(),
    });

    const user = userEvent.setup();
    renderComposer();

    const composer = screen.getByPlaceholderText(
      /Ask about your content, growth, or next video idea/i,
    );

    await user.type(composer, "@spr");
    await user.keyboard("{Enter}");

    const overlay = screen.getByTestId("loopie-composer-overlay-content");
    Object.defineProperty(composer, "scrollTop", { value: 42, configurable: true });
    Object.defineProperty(composer, "scrollLeft", {
      value: 7,
      configurable: true,
    });
    fireEvent.scroll(composer);

    expect(overlay).toHaveStyle({ transform: "translate(-7px, -42px)" });
  });

  it("does not normalize a trailing canonical token while still typing", async () => {
    useAudioDictationMock.mockReturnValue({
      status: "idle",
      inputLevel: 0,
      elapsedSeconds: 0,
      isSupported: true,
      errorMessage: null,
      stopDictation: vi.fn(),
      toggleDictation: vi.fn(() => Promise.resolve()),
      clearError: vi.fn(),
    });

    const user = userEvent.setup();
    const { sendMessage } = renderComposer();
    const composer = screen.getByPlaceholderText(
      /Ask about your content, growth, or next video idea/i,
    );

    await user.type(composer, "@entry:journal-1o");
    expect(composer).toHaveValue("@entry:journal-1o");

    await user.keyboard("{Enter}");
    expect(sendMessage).toHaveBeenCalledWith("@entry:journal-1o", []);
  });

  it("preserves unmapped private-use unicode when sending", async () => {
    useAudioDictationMock.mockReturnValue({
      status: "idle",
      inputLevel: 0,
      elapsedSeconds: 0,
      isSupported: true,
      errorMessage: null,
      stopDictation: vi.fn(),
      toggleDictation: vi.fn(() => Promise.resolve()),
      clearError: vi.fn(),
    });

    const user = userEvent.setup();
    const { sendMessage } = renderComposer();
    const composer = screen.getByPlaceholderText(
      /Ask about your content, growth, or next video idea/i,
    );

    const privateUseCharacter = "\uf8ff";
    await user.type(composer, `Hello ${privateUseCharacter}`);
    await user.keyboard("{Enter}");

    expect(sendMessage).toHaveBeenCalledWith(`Hello ${privateUseCharacter}`, []);
  });

  it("strips mapped orphan markers before sending", async () => {
    useAudioDictationMock.mockReturnValue({
      status: "idle",
      inputLevel: 0,
      elapsedSeconds: 0,
      isSupported: true,
      errorMessage: null,
      stopDictation: vi.fn(),
      toggleDictation: vi.fn(() => Promise.resolve()),
      clearError: vi.fn(),
    });

    const user = userEvent.setup();
    const { sendMessage } = renderComposer();
    const composer = screen.getByPlaceholderText(
      /Ask about your content, growth, or next video idea/i,
    );

    await user.type(composer, "@spr");
    await user.keyboard("{Enter}");
    await user.keyboard("{Backspace}{Backspace}test");
    await user.keyboard("{Enter}");

    const sentText = sendMessage.mock.calls[0]?.[0];
    expect(typeof sentText).toBe("string");
    if (typeof sentText === "string") {
      expect(sentText).toContain("Sprint recap");
      expect(hasPrivateUseCharacter(sentText)).toBe(false);
    }
  });
});

function readTextareaValue(element: HTMLElement): string {
  if (!(element instanceof HTMLTextAreaElement)) {
    throw new Error("Expected textarea element");
  }
  return element.value;
}

function hasPrivateUseCharacter(value: string): boolean {
  return /[\uE000-\uF8FF]/.test(value);
}
