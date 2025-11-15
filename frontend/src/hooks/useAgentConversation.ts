import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  conversationsQueries,
  createConversation,
  streamTurn,
  type TurnOut,
} from "@/api/conversations";
import {
  type AgentConversationAdapter,
  type AgentConversationState,
  type AgentMessage,
} from "@/lib/types/agent";

function turnToMessage(turn: TurnOut): AgentMessage {
  return {
    id: turn.id,
    role: turn.role as AgentMessage["role"],
    content: turn.text,
    createdAt: turn.created_at,
  };
}

export function useAgentConversation() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AgentConversationState>({
    conversationId: "",
    messages: [],
    composer: { status: "idle", error: null },
  });

  const streamCleanupRef = useRef<(() => void) | null>(null);

  // Mutation for creating conversations
  const createConversationMutation = useMutation({
    mutationFn: createConversation,
    onSuccess: (conversation) => {
      setState((previous) => ({
        ...previous,
        conversationId: conversation.id,
      }));
    },
    onError: (error) => {
      setState((previous) => ({
        ...previous,
        composer: {
          status: "idle",
          error:
            error instanceof Error
              ? error.message
              : "Failed to create conversation",
        },
      }));
    },
  });

  // Create conversation on mount
  useEffect(() => {
    void createConversationMutation.mutate({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup stream on unmount
  useEffect(
    () => () => {
      streamCleanupRef.current?.();
    },
    [],
  );

  const sendMessage = useCallback(
    async (input: string) => {
      const trimmed = input.trim();
      if (!trimmed || !state.conversationId) {
        return;
      }

      // Cancel any existing stream
      streamCleanupRef.current?.();

      const userMessage: AgentMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      setState((previous) => ({
        ...previous,
        messages: [...previous.messages, userMessage],
        composer: { status: "sending", error: null },
      }));

      // Track the streaming assistant message
      let assistantMessageId: string | null = null;
      const textParts: string[] = [];

      const cleanup = streamTurn({
        conversationId: state.conversationId,
        text: trimmed,
        onToken: (token) => {
          textParts.push(token);

          setState((previous) => {
            // First token - transition to responding and create temp message
            if (previous.composer.status === "sending") {
              assistantMessageId = crypto.randomUUID();
              return {
                ...previous,
                messages: [
                  ...previous.messages,
                  {
                    id: assistantMessageId,
                    role: "assistant",
                    content: token,
                    createdAt: new Date().toISOString(),
                  },
                ],
                composer: { status: "responding", error: null },
              };
            }

            // Subsequent tokens - update the last message
            if (assistantMessageId) {
              return {
                ...previous,
                messages: previous.messages.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: textParts.join("") }
                    : msg,
                ),
              };
            }

            return previous;
          });
        },
        onDone: (turnId, fullText) => {
          setState((previous) => {
            // Replace temp message with final one from backend
            const finalMessage: AgentMessage = {
              id: turnId,
              role: "assistant",
              content: fullText,
              createdAt: new Date().toISOString(),
            };

            return {
              ...previous,
              messages: assistantMessageId
                ? previous.messages.map((msg) =>
                    msg.id === assistantMessageId ? finalMessage : msg,
                  )
                : [...previous.messages, finalMessage],
              composer: { status: "idle", error: null },
            };
          });

          // Invalidate turns query to keep cache in sync
          void queryClient.invalidateQueries({
            queryKey: conversationsQueries.turns(state.conversationId).queryKey,
          });

          streamCleanupRef.current = null;
        },
        onError: (message) => {
          setState((previous) => ({
            ...previous,
            // Remove temp assistant message if it exists
            messages: assistantMessageId
              ? previous.messages.filter((msg) => msg.id !== assistantMessageId)
              : previous.messages,
            composer: { status: "idle", error: message },
          }));
          streamCleanupRef.current = null;
        },
      });

      streamCleanupRef.current = cleanup;
    },
    [state.conversationId, queryClient],
  );

  const resetConversation = useCallback(() => {
    // Cancel any ongoing stream
    streamCleanupRef.current?.();
    streamCleanupRef.current = null;

    // Create new conversation
    setState({
      conversationId: "",
      messages: [],
      composer: { status: "idle", error: null },
    });

    void createConversationMutation.mutate({});
  }, [createConversationMutation]);

  const adapter = useMemo<AgentConversationAdapter>(
    () => ({
      sendMessage,
      resetConversation,
    }),
    [sendMessage, resetConversation],
  );

  return useMemo(
    () => ({
      state,
      adapter,
    }),
    [adapter, state],
  );
}
