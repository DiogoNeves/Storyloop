import { useEffect, useMemo, useState, useCallback } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  conversationQueries,
  deleteConversation,
  listConversationTurns,
  type ConversationTurn,
} from "@/api/conversations";
import { useAgentConversationContext } from "@/context/AgentConversationContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { NavBar } from "@/components/NavBar";
import { AgentPanel } from "@/components/AgentPanel";

export function ConversationDetailPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setActiveConversation } = useAgentConversationContext();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const conversationListQuery = useMemo(
    () => conversationQueries.list(),
    [],
  );

  const conversationsQuery = useQuery(conversationListQuery);

  const deleteMutation = useMutation({
    mutationFn: deleteConversation,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: conversationListQuery.queryKey,
      });
    },
  });

  useEffect(() => {
    if (conversationId) {
      void setActiveConversation(conversationId).catch(() => {
        return undefined;
      });
    }

    return () => {
      void setActiveConversation(null).catch(() => {
        return undefined;
      });
    };
  }, [conversationId, setActiveConversation]);

  const turnsQuery = useQuery({
    queryKey: ["conversations", conversationId ?? "missing", "turns"],
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
      await setActiveConversation(null);
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
    setActiveConversation,
  ]);

  const conversationTitle = useMemo(() => {
    if (!conversationsQuery.data || !conversationId) {
      return null;
    }

    const conversation = conversationsQuery.data.find(
      (item) => item.id === conversationId,
    );

    return conversation?.title ?? null;
  }, [conversationId, conversationsQuery.data]);

  const resolvedConversationTitle =
    conversationTitle?.trim() || "Conversation detail";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gradient-to-br from-background to-muted/12 text-foreground">
      <NavBar />
      <main className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary/8 via-transparent to-transparent" />
        <div className="relative grid h-full min-h-0 w-full grid-cols-3 gap-6 px-6 py-12 lg:px-10 xl:px-16">
          <div className="col-span-2 flex h-full min-h-0 flex-col gap-6 overflow-y-auto scrollbar-hide">
            <Link
              to="/"
              className="text-sm font-medium text-primary underline-offset-2 hover:underline"
            >
              ← Back to activity feed
            </Link>
            <section className="space-y-6 rounded-lg border border-border bg-background p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm uppercase tracking-wide text-muted-foreground">
                    Loopie conversations
                  </p>
                  <h1 className="truncate text-2xl font-semibold tracking-tight">
                    {conversationId
                      ? resolvedConversationTitle
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
            </section>
          </div>
          <div className="col-span-1 flex h-full min-h-0">
            <AgentPanel />
          </div>
        </div>
      </main>
    </div>
  );
}
