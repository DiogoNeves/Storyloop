import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";

import { conversationQueries, deleteConversation } from "@/api/conversations";
import { LoopieConversationContent } from "@/components/LoopiePanel";
import { NavBar } from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { DeleteConversationDialog } from "@/components/DeleteConversationDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { useAgentConversationContext } from "@/context/AgentConversationContext";

export function ConversationDetailPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { state, adapter, setActiveConversation, isInitializing } =
    useAgentConversationContext();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const conversationListQuery = useMemo(() => conversationQueries.list(), []);

  const deleteMutation = useMutation({
    mutationFn: deleteConversation,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: conversationListQuery.queryKey,
      });
    },
  });

  useEffect(() => {
    if (!conversationId) {
      void setActiveConversation(null);
      return;
    }
    if (state.conversationId === conversationId && !isInitializing) {
      return;
    }
    void setActiveConversation(conversationId);
  }, [
    conversationId,
    isInitializing,
    setActiveConversation,
    state.conversationId,
  ]);

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
      if (state.conversationId === conversationId) {
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
    setActiveConversation,
    state.conversationId,
  ]);

  const shouldShowEmptyState =
    Boolean(conversationId) && !isInitializing && state.messages.length === 0;

  return (
    <div className="to-muted/12 relative min-h-screen bg-gradient-to-br from-background text-foreground">
      <NavBar onOpenSettings={() => setIsSettingsOpen(true)} />
      <main className="relative flex min-h-[calc(100vh-4rem)] flex-1 overflow-y-auto pt-16 lg:overflow-hidden">
        <div className="from-primary/8 pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b via-transparent to-transparent" />
        <div className="relative grid h-full min-h-[calc(100vh-4rem)] w-full grid-cols-1 gap-6 px-6 py-10 sm:py-12 lg:px-10 xl:px-16">
          <div className="scrollbar-hide col-span-1 flex h-full min-h-0 flex-col gap-6 overflow-y-auto">
            <Link
              to="/"
              className="text-sm font-medium text-primary underline-offset-2 hover:underline"
            >
              ← Back to activity feed
            </Link>
            <section className="flex min-h-0 flex-col gap-6 rounded-lg border border-border bg-background/90 p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-wide text-muted-foreground">
                    Loopie conversations
                  </p>
                  <h1 className="text-2xl font-semibold tracking-tight">
                    Conversation detail
                  </h1>
                </div>
                {conversationId ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setIsConfirmingDelete(true)}
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

              <div className="flex min-h-0 flex-1 flex-col gap-3">
                {isInitializing ? (
                  <p className="text-sm text-muted-foreground">
                    Loading conversation…
                  </p>
                ) : null}
                {shouldShowEmptyState ? (
                  <p className="text-sm text-muted-foreground">
                    No turns yet. Start chatting with Loopie to capture this
                    conversation.
                  </p>
                ) : null}
                <LoopieConversationContent
                  state={state}
                  adapter={adapter}
                  surfaceVariant="page"
                  composerPlaceholder="Share your next note or question for Loopie…"
                  idleHelperText="Loopie will keep the active chat elsewhere unchanged."
                  respondingHelperText="Loopie is preparing a reply"
                  disabled={isInitializing}
                />
              </div>
            </section>
          </div>
        </div>
      </main>
      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />

      <DeleteConversationDialog
        open={isConfirmingDelete}
        onOpenChange={setIsConfirmingDelete}
        isDeleting={deleteMutation.isPending}
        description="This Loopie conversation and its turns will be deleted. This action cannot be undone."
        onConfirm={() => {
          setIsConfirmingDelete(false);
          void handleDeleteConversation();
        }}
      />
    </div>
  );
}
