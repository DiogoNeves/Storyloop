import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAgentConversation } from "@/hooks";
import {
  mockCreateConversation,
  mockListConversationTurns,
  mockStreamConversationTurn,
} from "./mocks/conversationApi";

describe("useAgentConversation", () => {
  beforeEach(() => {
    mockListConversationTurns.mockReset();
    mockStreamConversationTurn.mockReset();
    mockCreateConversation.mockClear();
  });

  it("initializes an existing conversation without extra fetches", async () => {
    mockListConversationTurns.mockResolvedValue([
      {
        id: "turn-1",
        role: "user",
        text: "What should I film next?",
        createdAt: "2024-01-01T00:00:00Z",
      },
    ]);

    const { result } = renderHook(() =>
      useAgentConversation({
        conversationId: "conversation-123",
        allowCreate: false,
        persistConversationId: false,
      }),
    );

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
      expect(result.current.state.messages).toHaveLength(1);
    });

    expect(mockListConversationTurns).toHaveBeenCalledTimes(1);
    expect(mockListConversationTurns).toHaveBeenCalledWith("conversation-123");
    expect(mockCreateConversation).not.toHaveBeenCalled();
  });

  it("streams assistant responses for an existing conversation", async () => {
    mockListConversationTurns.mockResolvedValue([]);
    mockStreamConversationTurn.mockImplementation(async ({ callbacks }) => {
      callbacks?.onOpen?.();
      callbacks?.onToken?.("Hello");
      callbacks?.onToken?.(", creator!");
      callbacks?.onDone?.({ turnId: "assistant-1", text: "Hello, creator!" });
    });

    const { result } = renderHook(() =>
      useAgentConversation({
        conversationId: "conversation-abc",
        allowCreate: false,
        persistConversationId: false,
      }),
    );

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    await act(async () => {
      await result.current.adapter.sendMessage("Hi Loopie");
    });

    await waitFor(() => {
      expect(result.current.state.messages).toEqual([
        expect.objectContaining({
          role: "user",
          content: "Hi Loopie",
        }),
        expect.objectContaining({
          id: "assistant-1",
          role: "assistant",
          content: "Hello, creator!",
        }),
      ]);
      expect(result.current.state.composer.status).toBe("idle");
    });

    expect(mockStreamConversationTurn).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conversation-abc" }),
    );
  });
});
