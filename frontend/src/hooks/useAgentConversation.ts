import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createConversation,
  listTurns,
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
  const [state, setState] = useState<AgentConversationState>(() => ({
    conversationId: "",
    messages: [],
    composer: { status: "idle", error: null },
  }));

  const abortControllerRef = useRef<AbortController | null>(null);

  // Create conversation on mount
  useEffect(() => {
    let mounted = true;

    async function initializeConversation() {
      try {
        const conversation = await createConversation();
        if (mounted) {
          setState((previous) => ({
            ...previous,
            conversationId: conversation.id,
            messages: [],
            composer: { status: "idle", error: null },
          }));

          // Load existing turns if any
          const turns = await listTurns(conversation.id);
          if (mounted && turns.length > 0) {
            setState((previous) => ({
              ...previous,
              messages: turns.map(turnToMessage),
            }));
          }
        }
      } catch (error) {
        if (mounted) {
          setState((previous) => ({
            ...previous,
            composer: {
              status: "idle",
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to initialize conversation",
            },
          }));
        }
      }
    }

    void initializeConversation();

    return () => {
      mounted = false;
    };
  }, []);

  const sendMessage = useCallback(
    async (input: string) => {
      const trimmed = input.trim();
      if (!trimmed || !state.conversationId) {
        console.log("[useAgentConversation] sendMessage early return:", {
          trimmed,
          conversationId: state.conversationId,
        });
        return;
      }
      console.log("[useAgentConversation] sendMessage called:", {
        trimmed,
        conversationId: state.conversationId,
      });

      // Cancel any existing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

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

      // Create new abort controller for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        // Update to responding state
        setState((previous) => ({
          ...previous,
          composer: { status: "responding", error: null },
        }));

        let assistantContent = "";
        const assistantMessageId = crypto.randomUUID();

        // Create placeholder assistant message
        const assistantMessage: AgentMessage = {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
        };

        setState((previous) => ({
          ...previous,
          messages: [...previous.messages, assistantMessage],
        }));

        // Stream tokens
        for await (const event of streamTurn(state.conversationId, {
          text: trimmed,
        })) {
          if (abortController.signal.aborted) {
            break;
          }

          if (event.event === "token" && event.data.token) {
            assistantContent += event.data.token;
            setState((previous) => ({
              ...previous,
              messages: previous.messages.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: assistantContent }
                  : msg,
              ),
            }));
          } else if (event.event === "done") {
            if (event.data.text) {
              assistantContent = event.data.text;
            }
            setState((previous) => ({
              ...previous,
              messages: previous.messages.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: assistantContent }
                  : msg,
              ),
              composer: { status: "idle", error: null },
            }));
            break;
          } else if (event.event === "error") {
            const errorMessage =
              event.data.message ?? "Failed to get response from Loopie";
            setState((previous) => ({
              ...previous,
              messages: previous.messages.filter(
                (msg) => msg.id !== assistantMessageId,
              ),
              composer: { status: "idle", error: errorMessage },
            }));
            break;
          }
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to send message to Loopie";
        setState((previous) => ({
          ...previous,
          composer: { status: "idle", error: errorMessage },
        }));
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    },
    [state.conversationId],
  );

  const resetConversation = useCallback(async () => {
    // Cancel any ongoing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    try {
      const conversation = await createConversation();
      setState({
        conversationId: conversation.id,
        messages: [],
        composer: { status: "idle", error: null },
      });
    } catch (error) {
      setState((previous) => ({
        ...previous,
        composer: {
          status: "idle",
          error:
            error instanceof Error
              ? error.message
              : "Failed to reset conversation",
        },
      }));
    }
  }, []);

  const adapter = useMemo<AgentConversationAdapter>(
    () => ({
      sendMessage,
      resetConversation,
    }),
    [resetConversation, sendMessage],
  );

  return useMemo(
    () => ({
      state,
      adapter,
    }),
    [adapter, state],
  );
}
