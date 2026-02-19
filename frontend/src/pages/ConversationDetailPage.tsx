import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";

import { conversationQueries, deleteConversation } from "@/api/conversations";
import { LoopieConversationContent } from "@/components/LoopiePanel";
import { NavBar } from "@/components/NavBar";
import { StickyHeaderScrollableCard } from "@/components/StickyHeaderScrollableCard";
import { MobileBackTitleBar } from "@/components/detail/MobileBackTitleBar";
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
  const conversationTitle = "Loopie conversation";
  const renderMobileBackButton = () => (
    <MobileBackTitleBar backTo="/" title={conversationTitle} />
  );
  const mobileDeleteButton = conversationId ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setIsConfirmingDelete(true)}
      disabled={deleteMutation.isPending}
      className="lg:hidden"
    >
      {deleteMutation.isPending ? "Deleting…" : "Delete"}
    </Button>
  ) : null;

  return (
    <div className="to-muted/12 relative min-h-screen bg-gradient-to-br from-background text-foreground">
      <div className="hidden lg:block">
        <NavBar onOpenSettings={() => setIsSettingsOpen(true)} />
      </div>
      <main className="relative flex min-h-[100dvh] flex-1 overflow-y-auto pt-4 lg:min-h-[calc(100vh-4rem)] lg:overflow-hidden lg:pt-16">
        <div className="from-primary/8 pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b via-transparent to-transparent" />
        <div className="relative flex h-full min-h-[100dvh] w-full justify-start lg:min-h-[calc(100vh-4rem)]">
          <div className="grid h-full min-h-[100dvh] w-full grid-cols-1 gap-4 px-4 py-4 sm:gap-6 sm:px-5 sm:py-5 lg:w-2/3 lg:min-h-[calc(100vh-4rem)] lg:px-10">
            <div className="col-span-1 flex h-full min-h-0 flex-col gap-4 sm:gap-6">
              <Link
                to="/"
                className="hidden text-sm font-medium text-primary underline-offset-2 hover:underline lg:inline-flex"
              >
                ← Back to activity feed
              </Link>
              <StickyHeaderScrollableCard
                stickyHeaderAt="lg"
                mobileCollapsedHeader={renderMobileBackButton()}
                className="rounded-xl border-border/80 bg-background/90"
                bodyClassName="space-y-3"
                header={
                  <>
                    <div className="flex items-center gap-3 lg:hidden">
                      <div className="min-w-0 flex-1">
                        {renderMobileBackButton()}
                      </div>
                      {mobileDeleteButton}
                    </div>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <p className="text-sm uppercase tracking-wide text-muted-foreground">
                        {conversationTitle}
                      </p>
                      {conversationId ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setIsConfirmingDelete(true)}
                          disabled={deleteMutation.isPending}
                          className="hidden lg:inline-flex"
                        >
                          {deleteMutation.isPending
                            ? "Deleting…"
                            : "Delete conversation"}
                        </Button>
                      ) : null}
                    </div>
                  </>
                }
              >
                {deleteError ? (
                  <p className="text-sm text-destructive" role="status">
                    {deleteError}
                  </p>
                ) : null}
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
                <div className="min-h-[34rem]">
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
              </StickyHeaderScrollableCard>
            </div>
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
