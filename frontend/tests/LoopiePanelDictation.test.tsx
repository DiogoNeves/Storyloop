import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoopieConversationContent } from "@/components/LoopiePanel";
import { SyncContext, type SyncContextValue } from "@/context/SyncContext";
import type { AgentConversationState } from "@/lib/types/agent";

const useAudioDictationMock = vi.hoisted(() => vi.fn());
const settingsQueryFnMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useAudioDictation", () => ({
  useAudioDictation: useAudioDictationMock,
}));

vi.mock("@/api/entries", () => ({
  entriesQueries: {
    all: () => ({
      queryKey: ["entries"],
      queryFn: () => Promise.resolve([]),
    }),
  },
}));

vi.mock("@/api/settings", () => ({
  settingsQueries: {
    all: () => ({
      queryKey: ["settings"],
      queryFn: settingsQueryFnMock,
    }),
  },
  resolveSettingsResponse: (value?: unknown) =>
    (value as
      | {
          openaiKeyConfigured?: boolean;
        }
      | undefined) ?? {
      smartUpdateScheduleHours: 24,
      showArchived: false,
      activityFeedSortDate: "created",
      todayEntriesEnabled: true,
      todayIncludePreviousIncomplete: true,
      todayMoveCompletedToEnd: true,
      accentColor: "crimson",
      openaiKeyConfigured: false,
      ollamaBaseUrl: "http://127.0.0.1:11434",
      activeModel: "openai",
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

describe("LoopieConversationContent dictation", () => {
  beforeEach(() => {
    useAudioDictationMock.mockReset();
    settingsQueryFnMock.mockReset();
    settingsQueryFnMock.mockResolvedValue({
      smartUpdateScheduleHours: 24,
      showArchived: false,
      activityFeedSortDate: "created",
      todayEntriesEnabled: true,
      todayIncludePreviousIncomplete: true,
      todayMoveCompletedToEnd: true,
      accentColor: "crimson",
      openaiKeyConfigured: true,
      ollamaBaseUrl: "http://127.0.0.1:11434",
      activeModel: "openai",
    });
  });

  it("appends dictated text to existing composer input", async () => {
    useAudioDictationMock.mockImplementation(
      ({ onTranscription }: { onTranscription: (text: string) => void }) => ({
        status: "idle",
        inputLevel: 0,
        elapsedSeconds: 0,
        isSupported: true,
        errorMessage: null,
        startDictation: vi.fn(),
        stopDictation: vi.fn(),
        clearError: vi.fn(),
        toggleDictation: vi.fn(() => {
          onTranscription("dictated words");
          return Promise.resolve();
        }),
      }),
    );

    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <SyncContext.Provider value={syncContextValue}>
          <LoopieConversationContent
            state={state}
            adapter={{
              sendMessage: vi.fn(),
              stopResponse: vi.fn(),
              resetConversation: vi.fn(),
            }}
          />
        </SyncContext.Provider>
      </QueryClientProvider>,
    );

    const composer = screen.getByPlaceholderText(
      /Ask about your content, growth, or next video idea/i,
    );
    await user.type(composer, "Already here");

    const dictationButton = screen.getByRole("button", {
      name: "Dictate message",
    });
    await user.click(dictationButton);

    expect(composer).toHaveValue("Already here dictated words");
  });

  it("shows setup dialog instead of starting dictation when OpenAI key is missing", async () => {
    settingsQueryFnMock.mockResolvedValue({
      smartUpdateScheduleHours: 24,
      showArchived: false,
      activityFeedSortDate: "created",
      todayEntriesEnabled: true,
      todayIncludePreviousIncomplete: true,
      todayMoveCompletedToEnd: true,
      accentColor: "crimson",
      openaiKeyConfigured: false,
      ollamaBaseUrl: "http://127.0.0.1:11434",
      activeModel: "openai",
    });

    const toggleDictationSpy = vi.fn(() => Promise.resolve());
    useAudioDictationMock.mockImplementation(() => ({
      status: "idle",
      inputLevel: 0,
      elapsedSeconds: 0,
      isSupported: true,
      errorMessage: null,
      startDictation: vi.fn(),
      stopDictation: vi.fn(),
      clearError: vi.fn(),
      toggleDictation: toggleDictationSpy,
    }));

    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <SyncContext.Provider value={syncContextValue}>
          <LoopieConversationContent
            state={state}
            adapter={{
              sendMessage: vi.fn(),
              stopResponse: vi.fn(),
              resetConversation: vi.fn(),
            }}
          />
        </SyncContext.Provider>
      </QueryClientProvider>,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Dictate message",
      }),
    );

    expect(toggleDictationSpy).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", {
        name: "OpenAI key required for dictation",
      }),
    ).toBeInTheDocument();
  });
});
