import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoopieConversationContent } from "@/components/LoopiePanel";
import { SyncContext, type SyncContextValue } from "@/context/SyncContext";
import type { AgentConversationState } from "@/lib/types/agent";

const useAudioDictationMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useAudioDictation", () => ({
  useAudioDictation: useAudioDictationMock,
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

    render(
      <SyncContext.Provider value={syncContextValue}>
        <LoopieConversationContent
          state={state}
          adapter={{
            sendMessage: vi.fn(),
            stopResponse: vi.fn(),
            resetConversation: vi.fn(),
          }}
        />
      </SyncContext.Provider>,
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
});
