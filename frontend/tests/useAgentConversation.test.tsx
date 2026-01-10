import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAgentConversation } from "@/hooks";
import { type Conversation, type StreamTurnOptions } from "@/api/conversations";
import { entriesQueries } from "@/api/entries";
import {
  mockCreateConversation,
  mockListConversationTurns,
  mockStreamConversationTurn,
} from "./mocks/conversationApi";

describe("useAgentConversation", () => {
  let queryClient: QueryClient;

  const createQueryClientWrapper = () => {
    queryClient = new QueryClient();
    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

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

    const { result } = renderHook(
      () =>
        useAgentConversation({
          conversationId: "conversation-123",
          allowCreate: false,
          persistConversationId: false,
        }),
      { wrapper: createQueryClientWrapper() },
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
    mockStreamConversationTurn.mockImplementation(
      ({ callbacks }: StreamTurnOptions) => {
        callbacks?.onOpen?.();
        callbacks?.onToken?.("Hello");
        callbacks?.onToken?.(", creator!");
        callbacks?.onDone?.({ turnId: "assistant-1", text: "Hello, creator!" });
        return Promise.resolve();
      },
    );

    const { result } = renderHook(
      () =>
        useAgentConversation({
          conversationId: "conversation-abc",
          allowCreate: false,
          persistConversationId: false,
        }),
      { wrapper: createQueryClientWrapper() },
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

  it("inserts tool calls inline while streaming", async () => {
    mockListConversationTurns.mockResolvedValue([]);
    mockStreamConversationTurn.mockImplementation(
      ({ callbacks }: StreamTurnOptions) => {
        callbacks?.onOpen?.();
        callbacks?.onToken?.("Reading entry.");
        callbacks?.onToolCall?.("🧾 journal entry details");
        callbacks?.onToken?.("Update ready.");
        callbacks?.onDone?.({
          turnId: "assistant-2",
          text: "Reading entry.Update ready.",
        });
        return Promise.resolve();
      },
    );

    const { result } = renderHook(
      () =>
        useAgentConversation({
          conversationId: "conversation-tools",
          allowCreate: false,
          persistConversationId: false,
        }),
      { wrapper: createQueryClientWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    await act(async () => {
      await result.current.adapter.sendMessage("Check my journal");
    });

    await waitFor(() => {
      expect(result.current.state.messages).toEqual([
        expect.objectContaining({ role: "user", content: "Check my journal" }),
        expect.objectContaining({ role: "assistant", content: "Reading entry." }),
        expect.objectContaining({ role: "tool", content: "🧾 journal entry details" }),
        expect.objectContaining({
          id: "assistant-2",
          role: "assistant",
          content: "Update ready.",
        }),
      ]);
    });
  });

  it("invalidates entries after journal mutation tools", async () => {
    mockListConversationTurns.mockResolvedValue([]);
    mockStreamConversationTurn.mockImplementation(
      ({ callbacks }: StreamTurnOptions) => {
        callbacks?.onOpen?.();
        callbacks?.onToken?.("Creating entry.");
        callbacks?.onToolCall?.("📝 creating a journal entry");
        callbacks?.onToken?.("Done.");
        callbacks?.onDone?.({
          turnId: "assistant-3",
          text: "Creating entry.Done.",
        });
        return Promise.resolve();
      },
    );

    const { result } = renderHook(
      () =>
        useAgentConversation({
          conversationId: "conversation-journal-mutation",
          allowCreate: false,
          persistConversationId: false,
        }),
      { wrapper: createQueryClientWrapper() },
    );
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    await act(async () => {
      await result.current.adapter.sendMessage("Create a journal entry");
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: entriesQueries.all().queryKey,
        }),
      );
    });
  });

  it("populates the conversation list cache when starting a new conversation", async () => {
    mockListConversationTurns.mockResolvedValue([]);
    mockStreamConversationTurn.mockImplementation(
      ({ callbacks }: StreamTurnOptions) => {
        callbacks?.onDone?.({ turnId: "assistant-123", text: "Hello!" });
        return Promise.resolve();
      },
    );

    const wrapper = createQueryClientWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(
      () =>
        useAgentConversation({
          allowCreate: true,
          persistConversationId: false,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    await act(async () => {
      await result.current.adapter.sendMessage("Draft a caption");
    });

    await waitFor(() => {
      const cachedConversations = queryClient.getQueryData<Conversation[]>([
        "conversations",
      ]);
      expect(cachedConversations?.[0]).toMatchObject({
        id: "conversation-mock",
        lastTurnText: "Hello!",
        turnCount: 1,
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["conversations"] });
  });

  it("keeps the first assistant response as the conversation summary", async () => {
    mockListConversationTurns.mockResolvedValue([]);
    mockStreamConversationTurn
      .mockImplementationOnce(({ callbacks }: StreamTurnOptions) => {
        callbacks?.onDone?.({ turnId: "assistant-1", text: "First reply" });
        return Promise.resolve();
      })
      .mockImplementationOnce(({ callbacks }: StreamTurnOptions) => {
        callbacks?.onDone?.({ turnId: "assistant-2", text: "Second reply" });
        return Promise.resolve();
      });

    const { result } = renderHook(
      () =>
        useAgentConversation({
          allowCreate: true,
          persistConversationId: false,
        }),
      { wrapper: createQueryClientWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    await act(async () => {
      await result.current.adapter.sendMessage("First message");
    });

    await act(async () => {
      await result.current.adapter.sendMessage("Follow-up message");
    });

    const cachedConversations = queryClient.getQueryData<Conversation[]>([
      "conversations",
    ]);

    expect(cachedConversations?.[0]).toMatchObject({
      id: "conversation-mock",
      lastTurnText: "First reply",
      turnCount: 2,
    });
  });
});
