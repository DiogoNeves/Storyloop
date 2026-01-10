import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  createConversation,
  conversationQueries,
  listConversationTurns,
  streamConversationTurn,
  type Conversation,
  type ConversationTurn,
} from "@/api/conversations";
import { entriesQueries } from "@/api/entries";
import { isNotFoundError } from "@/api/client";
import type {
  AgentConversationAdapter,
  AgentConversationState,
  AgentMessage,
  AgentMessageAttachment,
  AgentFocus,
} from "@/lib/types/agent";

interface UseAgentConversationOptions {
  enabled?: boolean;
  conversationId?: string | null;
  allowCreate?: boolean;
  persistConversationId?: boolean;
  focus?: AgentFocus | null;
}

const INITIAL_STATE: AgentConversationState = {
  conversationId: "",
  messages: [],
  composer: { status: "idle", error: null },
};

const STORAGE_KEY = "storyloop.loopieConversationId";

function mapTurnToMessage(turn: ConversationTurn): AgentMessage {
  return {
    id: turn.id,
    role: turn.role,
    content: turn.text,
    createdAt: turn.createdAt,
    attachments: turn.attachments ?? [],
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
  conversationId: initialConversationId,
  allowCreate = true,
  persistConversationId = true,
  focus = null,
}: UseAgentConversationOptions = {}) {
  const [state, setState] = useState<AgentConversationState>(INITIAL_STATE);
  const [isInitializing, setIsInitializing] = useState(false);

  const queryClient = useQueryClient();
  const conversationListQuery = useMemo(() => conversationQueries.list(), []);

  const upsertConversationSummary = useCallback(
    (
      conversationId: string,
      updates: Partial<Conversation>,
      options?: { incrementTurnCount?: boolean },
    ) => {
      queryClient.setQueryData<Conversation[]>(
        conversationListQuery.queryKey,
        (previous) => {
          const existing = previous?.find(
            (conversation) => conversation.id === conversationId,
          );

          const base: Conversation = existing ?? {
            id: conversationId,
            title: null,
            createdAt: updates.createdAt ?? new Date().toISOString(),
            lastTurnAt: null,
            lastTurnText: null,
            firstTurnText: null,
            turnCount: 0,
          };

          const nextTurnCount = options?.incrementTurnCount
            ? (base.turnCount ?? 0) + 1
            : updates.turnCount ?? base.turnCount ?? 0;

          const shouldUpdateLastTurnText =
            updates.lastTurnText !== undefined && (base.turnCount ?? 0) <= 1;

          const next: Conversation = {
            ...base,
            ...updates,
            firstTurnText: base.firstTurnText ?? updates.firstTurnText ?? null,
            lastTurnText: shouldUpdateLastTurnText
              ? updates.lastTurnText
              : base.lastTurnText ?? updates.lastTurnText ?? null,
            turnCount: nextTurnCount,
          };

          const withoutExisting = (previous ?? []).filter(
            (conversation) => conversation.id !== conversationId,
          );
          return [next, ...withoutExisting];
        },
      );
    },
    [conversationListQuery.queryKey, queryClient],
  );

  const conversationIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const initializeTokenRef = useRef(0);
  const conversationIdPersistedRef = useRef(false);
  const focusRef = useRef<AgentFocus | null>(focus);

  const abortActiveStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    focusRef.current = focus;
  }, [focus]);

  const initializeConversation = useCallback(
    async ({
      forceNew = false,
      conversationId: targetConversationId = initialConversationId,
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

      setIsInitializing(true);
      setState({
        conversationId: "",
        messages: [],
        composer: { status: "idle", error: null },
              });

      try {
        if (forceNew && persistConversationId) {
          writeStoredConversationId(null);
        }

        let conversationId: string | null = null;
        let existingTurns: ConversationTurn[] = [];

        const loadConversation = async (id: string) => {
          const turns = await listConversationTurns(id);
          existingTurns = turns;
          conversationId = id;
          conversationIdPersistedRef.current = true;
          if (persistConversationId) {
            writeStoredConversationId(id);
          }
        };

        if (!forceNew && targetConversationId) {
          await loadConversation(targetConversationId);
        } else if (!forceNew && persistConversationId) {
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
                  });
      }
      if (initializeTokenRef.current === initializeToken) {
        setIsInitializing(false);
      }
    },
    [
      abortActiveStream,
      enabled,
      initialConversationId,
      persistConversationId,
    ],
  );

  useEffect(() => {
    if (!enabled) {
      abortActiveStream();
      conversationIdRef.current = null;
      setState(INITIAL_STATE);
      setIsInitializing(false);
      return;
    }

    void initializeConversation({ conversationId: initialConversationId });

    return () => {
      abortActiveStream();
    };
  }, [
    abortActiveStream,
    enabled,
    initialConversationId,
    initializeConversation,
  ]);

  const sendMessage = useCallback(
    async (input: string, attachments: AgentMessageAttachment[] = []) => {
      if (!enabled) {
        return;
      }

      if (state.composer.status !== "idle") {
        return;
      }

      const trimmed = input.trim();
      if (!trimmed && attachments.length === 0) {
        return;
      }

      let conversationId = conversationIdRef.current;
      if (!conversationId) {
        if (!allowCreate) {
          setState((previous) => ({
            ...previous,
            composer: {
              status: "idle",
              error: "We couldn't start this conversation.",
            },
          }));
          return;
        }
        try {
          const conversation = await createConversation();
          conversationId = conversation.id;
          conversationIdRef.current = conversationId;
          conversationIdPersistedRef.current = true;
          if (persistConversationId) {
            writeStoredConversationId(conversationId);
          }
          upsertConversationSummary(conversationId, {
            title: conversation.title,
            createdAt: conversation.createdAt,
          });
          await queryClient.invalidateQueries({
            queryKey: conversationListQuery.queryKey,
          });
          setState((previous) => ({
            ...previous,
            conversationId: conversationId ?? "",
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

      let streamingMessageId = crypto.randomUUID();
      let streamingMessageCreatedAt = new Date().toISOString();

      const upsertAssistantMessage = (
        content: string,
        overrides?: Partial<AgentMessage>,
        composerOverride?: AgentConversationState["composer"],
      ) => {
        const existingIndex = messageBuffer.findIndex(
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
            : messageBuffer[existingIndex];

        const updatedMessage: AgentMessage = {
          ...baseMessage,
          ...overrides,
          content,
        };

        messageBuffer =
          existingIndex === -1
            ? [...messageBuffer, updatedMessage]
            : messageBuffer.map((message, index) =>
              index === existingIndex ? updatedMessage : message,
            );

        setState((previous) => {
          if (previous.conversationId !== conversationId) {
            return previous;
          }

          return {
            ...previous,
            messages: messageBuffer,
            composer: composerOverride ?? previous.composer,
          };
        });
      };

      const removeAssistantMessage = () => {
        const messages = messageBuffer.filter(
          (message) => message.id !== streamingMessageId,
        );
        if (messages.length === messageBuffer.length) {
          return;
        }
        messageBuffer = messages;
        setState((previous) => {
          if (previous.conversationId !== conversationId) {
            return previous;
          }
          return {
            ...previous,
            messages: messageBuffer,
          };
        });
      };

      const appendToolCall = (message: string) => {
        const toolMessage: AgentMessage = {
          id: crypto.randomUUID(),
          role: "tool",
          content: message,
          createdAt: new Date().toISOString(),
        };
        const normalizedMessage = message.toLowerCase();
        if (
          normalizedMessage.includes("journal entry") &&
          (normalizedMessage.includes("updating") ||
            normalizedMessage.includes("creating"))
        ) {
          shouldInvalidateEntries = true;
        }
        const nextMessageId = crypto.randomUUID();
        const nextCreatedAt = new Date().toISOString();
        const currentMessageId = streamingMessageId;
        const currentCreatedAt = streamingMessageCreatedAt;
        const currentSegmentText = segmentText;

        const messages = messageBuffer.filter(
          (message) => message.id !== currentMessageId,
        );
        if (currentSegmentText) {
          messages.push({
            id: currentMessageId,
            role: "assistant",
            content: currentSegmentText,
            createdAt: currentCreatedAt,
          });
        }

        messageBuffer = [
          ...messages,
          toolMessage,
          {
            id: nextMessageId,
            role: "assistant",
            content: "",
            createdAt: nextCreatedAt,
          },
        ];

        setState((previous) => {
          if (previous.conversationId !== conversationId) {
            return previous;
          }

          return {
            ...previous,
            messages: messageBuffer,
          };
        });

        streamingMessageId = nextMessageId;
        streamingMessageCreatedAt = nextCreatedAt;
        segmentText = "";
        hasToolSplit = true;
      };

      const userMessage: AgentMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
        attachments,
      };

      let messageBuffer = [...state.messages, userMessage];

      setState(() => ({
        conversationId,
        messages: messageBuffer,
        composer: { status: "sending", error: null },
      }));

      upsertConversationSummary(
        conversationId,
        {
          lastTurnAt: userMessage.createdAt,
          firstTurnText: trimmed,
        },
        { incrementTurnCount: true },
      );

      abortActiveStream();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      let accumulatedText = "";
      let segmentText = "";
      let hasStreamedToken = false;
      let hasToolSplit = false;
      let shouldInvalidateEntries = false;

      try {
        await streamConversationTurn({
          conversationId,
          text: trimmed,
          attachments: attachments.map((attachment) => attachment.id),
          focus: focusRef.current ?? undefined,
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
              }
              accumulatedText += token;
              segmentText += token;
              upsertAssistantMessage(segmentText);
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
              const displayText = hasToolSplit ? segmentText : finalText;
              if (hasToolSplit && !displayText) {
                removeAssistantMessage();
              } else {
                upsertAssistantMessage(
                  displayText,
                  overrides,
                  { status: "idle", error: null },
                );
              }
              if (!conversationIdPersistedRef.current) {
                conversationIdPersistedRef.current = true;
                if (persistConversationId) {
                  writeStoredConversationId(conversationId);
                }
              }

              upsertConversationSummary(
                conversationId,
                {
                  lastTurnAt: streamingMessageCreatedAt,
                  lastTurnText: finalText,
                },
                { incrementTurnCount: false },
              );

              if (shouldInvalidateEntries) {
                const entriesListQuery = entriesQueries.all();
                void queryClient.invalidateQueries({
                  queryKey: entriesListQuery.queryKey,
                });
              }

              void queryClient.invalidateQueries({
                queryKey: conversationListQuery.queryKey,
              });
            },
            onError: (message) => {
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
            onToolCall: (message) => {
              appendToolCall(message);
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
    [
      abortActiveStream,
      allowCreate,
      enabled,
      initializeConversation,
      persistConversationId,
      queryClient,
      conversationListQuery.queryKey,
      upsertConversationSummary,
      state.composer.status,
    ],
  );

  const stopResponse = useCallback(() => {
    abortActiveStream();

    setState((previous) => {
      if (previous.composer.status === "idle") {
        return previous;
      }

      if (previous.conversationId !== (conversationIdRef.current ?? previous.conversationId)) {
        return previous;
      }

      const hasStopMarker = previous.messages.some(
        (message) => message.content === "[user stopped]" && message.role === "system",
      );

      return {
        ...previous,
        messages: hasStopMarker
          ? previous.messages
          : [
            ...previous.messages,
            {
              id: crypto.randomUUID(),
              role: "system",
              content: "[user stopped]",
              createdAt: new Date().toISOString(),
            },
          ],
        composer: { status: "idle", error: null },
              };
    });
  }, [abortActiveStream]);

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
    stopResponse,
    resetConversation,
  }), [resetConversation, sendMessage, stopResponse]);

  return useMemo(
    () => ({
      state,
      adapter,
      setActiveConversation,
      isInitializing,
    }),
    [adapter, isInitializing, state, setActiveConversation],
  );
}
