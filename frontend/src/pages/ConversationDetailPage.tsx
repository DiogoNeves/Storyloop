import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowUp } from "lucide-react";

import {
  conversationQueries,
  deleteConversation,
  listConversationTurns,
  streamConversationTurn,
  type ConversationTurn,
} from "@/api/conversations";
import { useAgentConversationContext } from "@/context/AgentConversationContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { NavBar } from "@/components/NavBar";

export function ConversationDetailPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { state: agentConversationState, setActiveConversation } =
    useAgentConversationContext();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [composerValue, setComposerValue] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerStatus, setComposerStatus] = useState<
    "idle" | "sending" | "responding"
  >("idle");
  const streamControllerRef = useRef<AbortController | null>(null);
  const conversationListQuery = useMemo(
    () => conversationQueries.list(),
    [],
  );
  const turnsQueryKey = useMemo(
    () => ["conversations", conversationId ?? "missing", "turns"],
    [conversationId],
  );

  const deleteMutation = useMutation({
    mutationFn: deleteConversation,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: conversationListQuery.queryKey,
      });
    },
  });

  const turnsQuery = useQuery({
    queryKey: turnsQueryKey,
    queryFn: () => {
      if (!conversationId) {
        return Promise.reject(new Error("Conversation ID is required"));
      }
      return listConversationTurns(conversationId);
    },
    enabled: Boolean(conversationId),
  });

  const messages = useMemo(() => {
    if (!turnsQuery.data) {
      return [];
    }
    return turnsQuery.data.map((turn: ConversationTurn) => ({
      id: turn.id,
      role: turn.role,
      content: turn.text,
      createdAt: turn.createdAt,
    }));
  }, [turnsQuery.data]);

  const handleDeleteConversation = useCallback(async () => {
    if (!conversationId || deleteMutation.isPending) {
      return;
    }
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync(conversationId);
      await queryClient.invalidateQueries({
        queryKey: ["conversations", conversationId, "turns"],
      });
      if (agentConversationState.conversationId === conversationId) {
        await setActiveConversation(null);
      }
      void navigate("/");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "We couldn't delete this conversation. Try again.";
      setDeleteError(message);
    }
  }, [
    conversationId,
    deleteMutation,
    navigate,
    queryClient,
    agentConversationState.conversationId,
    setActiveConversation,
  ]);

  const upsertTurn = useCallback(
    (
      nextTurn: ConversationTurn,
      options?: { replaceId?: string | null },
    ) => {
      queryClient.setQueryData<ConversationTurn[] | undefined>(
        turnsQueryKey,
        (existing = []) => {
          const replaceId = options?.replaceId;
          const filtered = replaceId
            ? existing.filter((turn) => turn.id !== replaceId)
            : existing;
          const existingIndex = filtered.findIndex(
            (turn) => turn.id === nextTurn.id,
          );

          if (existingIndex === -1) {
            return [...filtered, nextTurn];
          }

          return filtered.map((turn, index) =>
            index === existingIndex ? nextTurn : turn,
          );
        },
      );
    },
    [queryClient, turnsQueryKey],
  );

  const removeTurnById = useCallback(
    (turnId: string | null) => {
      if (!turnId) {
        return;
      }
      queryClient.setQueryData<ConversationTurn[] | undefined>(
        turnsQueryKey,
        (existing = []) =>
          existing.filter((turn) => {
            return turn.id !== turnId;
          }),
      );
    },
    [queryClient, turnsQueryKey],
  );

  useEffect(() => {
    return () => {
      if (streamControllerRef.current) {
        streamControllerRef.current.abort();
      }
    };
  }, []);

  const handleSendFollowUp = useCallback(async () => {
    if (!conversationId || composerStatus !== "idle") {
      return;
    }

    const trimmed = composerValue.trim();
    if (!trimmed) {
      return;
    }

    setComposerError(null);
    const userTurn: ConversationTurn = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
    upsertTurn(userTurn);
    setComposerStatus("sending");
    setComposerValue("");

    const controller = new AbortController();
    streamControllerRef.current = controller;
    const placeholderId = crypto.randomUUID();
    const placeholderCreatedAt = new Date().toISOString();
    let accumulatedText = "";

    try {
      await streamConversationTurn({
        conversationId,
        text: trimmed,
        signal: controller.signal,
        callbacks: {
          onOpen: () => {
            setComposerStatus("responding");
          },
          onToken: (token) => {
            accumulatedText += token;
            upsertTurn({
              id: placeholderId,
              role: "assistant",
              text: accumulatedText,
              createdAt: placeholderCreatedAt,
            });
          },
          onDone: ({ turnId, text }) => {
            const finalText = text ?? accumulatedText;
            if (!finalText) {
              setComposerError("Loopie couldn't generate a response.");
              setComposerStatus("idle");
              removeTurnById(placeholderId);
              return;
            }
            const finalId = turnId ?? placeholderId;
            upsertTurn(
              {
                id: finalId,
                role: "assistant",
                text: finalText,
                createdAt: placeholderCreatedAt,
              },
              {
                replaceId:
                  turnId && turnId !== placeholderId ? placeholderId : null,
              },
            );
            setComposerStatus("idle");
            void queryClient.invalidateQueries({ queryKey: turnsQueryKey });
          },
          onError: (message) => {
            setComposerError(
              message ?? "Loopie ran into an error generating a response.",
            );
            setComposerStatus("idle");
            removeTurnById(placeholderId);
          },
        },
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        const message =
          error instanceof Error
            ? error.message
            : "We couldn't reach Loopie. Try again.";
        setComposerError(message);
        setComposerStatus("idle");
        removeTurnById(placeholderId);
      }
    } finally {
      if (streamControllerRef.current === controller) {
        streamControllerRef.current = null;
      }
    }
  }, [
    composerStatus,
    composerValue,
    conversationId,
    queryClient,
    removeTurnById,
    turnsQueryKey,
    upsertTurn,
  ]);

  const isComposerDisabled =
    composerStatus === "sending" || composerStatus === "responding";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gradient-to-br from-background to-muted/12 text-foreground">
      <NavBar />
      <main className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary/8 via-transparent to-transparent" />
        <div className="relative grid h-full min-h-0 w-full grid-cols-1 gap-6 px-6 py-12 lg:px-10 xl:px-16">
          <div className="col-span-1 flex h-full min-h-0 flex-col gap-6 overflow-y-auto scrollbar-hide">
            <Link
              to="/"
              className="text-sm font-medium text-primary underline-offset-2 hover:underline"
            >
              ← Back to activity feed
            </Link>
            <section className="flex min-h-0 flex-col gap-6 rounded-lg border border-border bg-background p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-wide text-muted-foreground">
                    Loopie conversations
                  </p>
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {conversationId
                      ? "Conversation detail"
                      : "Conversation not found"}
                  </h1>
                </div>
                {conversationId ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      void handleDeleteConversation();
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending
                      ? "Deleting…"
                      : "Delete conversation"}
                  </Button>
                ) : null}
              </div>

              {deleteError ? (
                <p className="text-sm text-destructive" role="status">
                  {deleteError}
                </p>
              ) : null}

              <Card className="flex flex-1 flex-col">
                <CardContent className="space-y-4">
                  {turnsQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">
                      Loading conversation…
                    </p>
                  ) : turnsQuery.isError ? (
                    <p className="text-sm text-destructive">
                      {turnsQuery.error instanceof Error
                        ? turnsQuery.error.message
                        : "We couldn't load that conversation."}
                    </p>
                  ) : messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No turns yet. Start chatting with Loopie to capture this
                      conversation.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-5">
                      {messages.map((message) => (
                        <ChatMessage key={message.id} message={message} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Continue this conversation</p>
                  <p className="text-xs text-muted-foreground">
                    Loopie stays hidden while you reply here.
                  </p>
                </div>
                {composerError ? (
                  <p className="text-sm text-destructive" role="status">
                    {composerError}
                  </p>
                ) : null}
                <div className="space-y-2">
                  <div className="relative rounded-2xl border border-border/50 bg-background shadow-sm focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
                    <Textarea
                      value={composerValue}
                      onChange={(event) => setComposerValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void handleSendFollowUp();
                        }
                      }}
                      placeholder="Share your next note or question for Loopie…"
                      disabled={isComposerDisabled}
                      className="min-h-[96px] resize-none border-0 bg-transparent px-4 py-3 pr-24 text-sm shadow-none focus-visible:outline-none focus-visible:ring-0"
                    />
                    <div className="absolute bottom-3 right-3 flex items-center gap-2">
                      <span className="hidden text-[10px] text-muted-foreground/70 sm:inline">
                        {composerStatus === "responding"
                          ? "Loopie is thinking"
                          : "Shift + Enter"}
                      </span>
                      <Button
                        type="button"
                        onClick={() => {
                          void handleSendFollowUp();
                        }}
                        disabled={isComposerDisabled}
                        className="h-9 w-9 rounded-full bg-gradient-to-r from-primary via-primary/80 to-primary p-0 text-primary-foreground shadow-lg transition hover:from-primary/90 hover:to-primary/80 disabled:opacity-60"
                        aria-label="Send to Loopie"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70">
                    {composerStatus === "responding"
                      ? "Loopie is preparing a reply"
                      : "Loopie will keep the active chat elsewhere unchanged."}
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
