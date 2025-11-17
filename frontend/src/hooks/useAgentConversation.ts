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
  composer: { status: "idle", error: null },
  toolSignals: [],
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

export function useAgentConversation({
  enabled = true,
}: UseAgentConversationOptions = {}) {
  const [state, setState] = useState<AgentConversationState>(INITIAL_STATE);

  const conversationIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const initializeTokenRef = useRef(0);
  const conversationIdPersistedRef = useRef(false);

  const abortActiveStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const initializeConversation = useCallback(
    async ({
      forceNew = false,
      conversationId: targetConversationId,
    }: {
      forceNew?: boolean;
      conversationId?: string | null;
    } = {}) => {
      if (!enabled) {
        return;
      }

      initializeTokenRef.current += 1;
      const initializeToken = initializeTokenRef.current;

      abortActiveStream();
      conversationIdRef.current = null;
       conversationIdPersistedRef.current = false;

      setState({
        conversationId: "",
        messages: [],
        composer: { status: "idle", error: null },
        toolSignals: [],
      });

      try {
        if (forceNew) {
          writeStoredConversationId(null);
        }

        let conversationId: string | null = null;
        let existingTurns: ConversationTurn[] = [];

        const loadConversation = async (id: string) => {
          const turns = await listConversationTurns(id);
          existingTurns = turns;
          conversationId = id;
          conversationIdPersistedRef.current = true;
          writeStoredConversationId(id);
        };

        if (!forceNew && targetConversationId) {
          try {
            await loadConversation(targetConversationId);
          } catch (error) {
            if (isNotFoundError(error)) {
              writeStoredConversationId(null);
            } else {
              throw error;
            }
          }
        }

        if (!forceNew && !conversationId) {
          const storedId = readStoredConversationId();
          if (storedId) {
            try {
              await loadConversation(storedId);
            } catch (error) {
              if (isNotFoundError(error)) {
                writeStoredConversationId(null);
              } else {
                throw error;
              }
            }
          }
        }

        if (initializeTokenRef.current !== initializeToken) {
          return;
        }

        conversationIdRef.current = conversationId;
        conversationIdPersistedRef.current = conversationId !== null;

        setState({
          conversationId: conversationId ?? "",
          messages: existingTurns.map(mapTurnToMessage),
          composer: { status: "idle", error: null },
          toolSignals: [],
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
          composer: { status: "idle", error: message },
          toolSignals: [],
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

      let conversationId = conversationIdRef.current;
      if (!conversationId) {
        try {
          const conversation = await createConversation();
          conversationId = conversation.id;
          conversationIdRef.current = conversationId;
          conversationIdPersistedRef.current = true;
          writeStoredConversationId(conversationId);
          setState((previous) => ({
            ...previous,
            conversationId,
          }));
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "We couldn't start a new conversation.";
          setState((previous) => ({
            ...previous,
            composer: { status: "idle", error: message },
          }));
          return;
        }
      }

      const streamingMessageId = crypto.randomUUID();
      const streamingMessageCreatedAt = new Date().toISOString();

      const upsertAssistantMessage = (
        content: string,
        overrides?: Partial<AgentMessage>,
        composerOverride?: AgentConversationState["composer"],
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

          if (composerOverride) {
            return {
              ...previous,
              messages,
              composer: composerOverride,
            };
          }

          return {
            ...previous,
            messages,
          };
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

      const clearToolSignals = () => {
        setState((previous) => {
          if (previous.conversationId !== conversationId) {
            return previous;
          }

          if (previous.toolSignals.length === 0) {
            return previous;
          }

          return {
            ...previous,
            toolSignals: [],
          };
        });
      };

      const addToolSignal = (message: string) => {
        const toolSignal = {
          id: crypto.randomUUID(),
          message,
          receivedAt: new Date().toISOString(),
        } as const;

        setState((previous) => {
          if (previous.conversationId !== conversationId) {
            return previous;
          }

          return {
            ...previous,
            toolSignals: [...previous.toolSignals, toolSignal],
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
      let hasStreamedToken = false;

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
            onToken: (token) => {
              if (!hasStreamedToken) {
                hasStreamedToken = true;
                clearToolSignals();
              }
              accumulatedText += token;
              upsertAssistantMessage(accumulatedText);
            },
            onDone: ({ turnId, text }) => {
              clearToolSignals();
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
              );
              if (!conversationIdPersistedRef.current) {
                conversationIdPersistedRef.current = true;
                writeStoredConversationId(conversationId);
              }
            },
            onError: (message) => {
              clearToolSignals();
              setState((previous) => ({
                ...previous,
                composer: {
                  status: "idle",
                  error: message ?? "Loopie ran into an error.",
                },
              }));
              if (!accumulatedText) {
                removeAssistantMessage();
              }
            },
            onToolCall: addToolSignal,
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

  const setActiveConversation = useCallback(
    async (conversationId?: string | null) => {
      if (!enabled) {
        return;
      }
      if (!conversationId) {
        await initializeConversation({ forceNew: true });
        return;
      }
      await initializeConversation({ conversationId });
    },
    [enabled, initializeConversation],
  );

  const adapter = useMemo<AgentConversationAdapter>(() => ({
    sendMessage,
    resetConversation,
  }), [resetConversation, sendMessage]);

  return useMemo(
    () => ({
      state,
      adapter,
      setActiveConversation,
    }),
    [adapter, state, setActiveConversation],
  );
}
