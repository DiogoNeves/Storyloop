import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createConversation,
  isNotFoundError,
  listConversationTurns,
  streamConversationTurn,
  type ConversationTurn,
} from "@/api/conversations";
import type {
  AgentConversationAdapter,
  AgentConversationState,
  AgentMessage,
} from "@/lib/types/agent";

interface UseAgentConversationOptions {
  enabled?: boolean;
}

const INITIAL_STATE: AgentConversationState = {
  conversationId: "",
  messages: [],
  toolSignals: [],
  composer: { status: "idle", error: null },
};

const STORAGE_KEY = "storyloop.loopieConversationId";

function mapTurnToMessage(turn: ConversationTurn): AgentMessage {
  return {
    id: turn.id,
    role: turn.role,
    content: turn.text,
    createdAt: turn.createdAt,
  };
}

function readStoredConversationId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredConversationId(conversationId: string | null): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (conversationId) {
      window.localStorage.setItem(STORAGE_KEY, conversationId);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors (e.g., Safari private mode)
  }
}

const TOOL_SIGNAL_LABELS: Record<string, string> = {
  load_journal_entries: "👀 Checking your latest journal entries",
  list_recent_videos: "📺 Reviewing your recent uploads",
  get_video_details: "🧭 Pulling video details",
  get_video_metrics: "📊 Analyzing video metrics",
};

function describeToolSignal(toolName: string): string {
  return TOOL_SIGNAL_LABELS[toolName] ?? `Loopie is calling ${toolName}`;
}

export function useAgentConversation({
  enabled = true,
}: UseAgentConversationOptions = {}) {
  const [state, setState] = useState<AgentConversationState>(INITIAL_STATE);

  const conversationIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const initializeTokenRef = useRef(0);

  const abortActiveStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const initializeConversation = useCallback(
    async ({ forceNew = false }: { forceNew?: boolean } = {}) => {
      if (!enabled) {
        return;
      }

      initializeTokenRef.current += 1;
      const initializeToken = initializeTokenRef.current;

      abortActiveStream();
      conversationIdRef.current = null;

      setState({
        conversationId: "",
        messages: [],
        composer: { status: "idle", error: null },
      });

      try {
        let conversationId: string | null = null;
        let existingTurns: ConversationTurn[] = [];

        if (!forceNew) {
          const storedId = readStoredConversationId();
          if (storedId) {
            try {
              existingTurns = await listConversationTurns(storedId);
              conversationId = storedId;
            } catch (error) {
              if (isNotFoundError(error)) {
                writeStoredConversationId(null);
              } else {
                throw error;
              }
            }
          }
        } else {
          writeStoredConversationId(null);
        }

        if (!conversationId) {
          const newConversation = await createConversation();
          conversationId = newConversation.id;
          existingTurns = [];
          writeStoredConversationId(conversationId);
        }

        if (initializeTokenRef.current !== initializeToken) {
          return;
        }

        conversationIdRef.current = conversationId;

        setState({
          conversationId,
          messages: existingTurns.map(mapTurnToMessage),
          toolSignals: [],
          composer: { status: "idle", error: null },
        });
      } catch (error) {
        if (initializeTokenRef.current !== initializeToken) {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : "We couldn't start a conversation with Loopie.";
        setState({
          conversationId: "",
          messages: [],
          toolSignals: [],
          composer: { status: "idle", error: message },
        });
      }
    },
    [abortActiveStream, enabled],
  );

  useEffect(() => {
    if (!enabled) {
      abortActiveStream();
      conversationIdRef.current = null;
      setState(INITIAL_STATE);
      return;
    }

    void initializeConversation();

    return () => {
      abortActiveStream();
    };
  }, [abortActiveStream, enabled, initializeConversation]);

  const sendMessage = useCallback(
    async (input: string) => {
      if (!enabled) {
        return;
      }

      const trimmed = input.trim();
      if (!trimmed) {
        return;
      }

      const conversationId = conversationIdRef.current;
      if (!conversationId) {
        setState((previous) => ({
          ...previous,
          composer: {
            status: "idle",
            error: "Loopie is still getting ready. Try again in a moment.",
          },
          toolSignals: [],
        }));
        return;
      }

      const streamingMessageId = crypto.randomUUID();
      const streamingMessageCreatedAt = new Date().toISOString();

      const upsertAssistantMessage = (
        content: string,
        overrides?: Partial<AgentMessage>,
        composerOverride?: AgentConversationState["composer"],
        clearToolSignals = false,
      ) => {
        setState((previous) => {
          if (previous.conversationId !== conversationId) {
            return previous;
          }

          const existingIndex = previous.messages.findIndex(
            (message) => message.id === streamingMessageId,
          );

          const baseMessage: AgentMessage =
            existingIndex === -1
              ? {
                  id: streamingMessageId,
                  role: "assistant",
                  content: "",
                  createdAt: streamingMessageCreatedAt,
                }
              : previous.messages[existingIndex];

          const updatedMessage: AgentMessage = {
            ...baseMessage,
            ...overrides,
            content,
          };

          const messages =
            existingIndex === -1
              ? [...previous.messages, updatedMessage]
              : previous.messages.map((message, index) =>
                  index === existingIndex ? updatedMessage : message,
                );

          const updatedState: AgentConversationState = {
            ...previous,
            messages,
          };

          if (composerOverride) {
            updatedState.composer = composerOverride;
          }

          if (clearToolSignals) {
            updatedState.toolSignals = [];
          }

          return updatedState;
        });
      };

      const removeAssistantMessage = () => {
        setState((previous) => {
          if (previous.conversationId !== conversationId) {
            return previous;
          }
          const messages = previous.messages.filter(
            (message) => message.id !== streamingMessageId,
          );
          if (messages.length === previous.messages.length) {
            return previous;
          }
          return {
            ...previous,
            messages,
          };
        });
      };

      const userMessage: AgentMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      setState((previous) => ({
        conversationId,
        messages: [...previous.messages, userMessage],
        toolSignals: [],
        composer: { status: "sending", error: null },
      }));

      abortActiveStream();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      let accumulatedText = "";
      let clearedToolSignals = false;

      try {
        await streamConversationTurn({
          conversationId,
          text: trimmed,
          signal: controller.signal,
          callbacks: {
            onOpen: () => {
              setState((previous) => ({
                ...previous,
                composer: { status: "responding", error: null },
              }));
            },
            onTool: (toolName) => {
              const label = describeToolSignal(toolName);
              setState((previous) => {
                if (previous.conversationId !== conversationId) {
                  return previous;
                }

                const signal = { id: crypto.randomUUID(), label };

                return {
                  ...previous,
                  toolSignals: [...previous.toolSignals, signal],
                  composer: { status: "responding", error: null },
                };
              });
            },
            onToken: (token) => {
              accumulatedText += token;
              const shouldClearSignals = !clearedToolSignals;
              clearedToolSignals = true;
              upsertAssistantMessage(
                accumulatedText,
                undefined,
                undefined,
                shouldClearSignals,
              );
            },
            onDone: ({ turnId, text }) => {
              const finalText = text ?? accumulatedText;
              if (!finalText) {
                setState((previous) => ({
                  ...previous,
                  composer: {
                    status: "idle",
                    error: "Loopie couldn't generate a response.",
                  },
                }));
                return;
              }
              const overrides: Partial<AgentMessage> = {
                createdAt: streamingMessageCreatedAt,
              };
              if (turnId) {
                overrides.id = turnId;
              }
              upsertAssistantMessage(
                finalText,
                overrides,
                { status: "idle", error: null },
                true,
              );
            },
            onError: (message) => {
              setState((previous) => ({
                ...previous,
                composer: {
                  status: "idle",
                  error: message ?? "Loopie ran into an error.",
                },
                toolSignals: [],
              }));
              if (!accumulatedText) {
                removeAssistantMessage();
              }
            },
          },
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        if ((error as { status?: number } | null)?.status === 404) {
          await initializeConversation({ forceNew: true });
          setState((previous) => ({
            ...previous,
            composer: {
              status: "idle",
              error: "Loopie restarted the chat. Please send that again.",
            },
            toolSignals: [],
          }));
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "We couldn't reach Loopie. Try again.";
        setState((previous) => ({
          ...previous,
          composer: { status: "idle", error: message },
          toolSignals: [],
        }));
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [abortActiveStream, enabled, initializeConversation],
  );

  const resetConversation = useCallback(() => {
    if (!enabled) {
      return;
    }
    void initializeConversation({ forceNew: true });
  }, [enabled, initializeConversation]);

  const adapter = useMemo<AgentConversationAdapter>(() => ({
    sendMessage,
    resetConversation,
  }), [resetConversation, sendMessage]);

  return useMemo(
    () => ({
      state,
      adapter,
    }),
    [adapter, state],
  );
}
