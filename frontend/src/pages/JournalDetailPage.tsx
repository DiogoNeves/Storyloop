import { useCallback, useMemo, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Pin } from "lucide-react";
import { Link, useParams, useNavigate } from "react-router-dom";
import useLocalStorageState from "use-local-storage-state";

import { entriesMutations, entriesQueries, type Entry } from "@/api/entries";
import { useYouTubeFeed } from "@/hooks/useYouTubeFeed";
import { useEntryEditing } from "@/hooks/useEntryEditing";
import { useSmartEntryUpdate } from "@/hooks/useSmartEntryUpdate";
import { useSync } from "@/hooks/useSync";
import { entryToActivityItem } from "@/lib/types/entries";
import { useAgentConversationContext } from "@/context/AgentConversationContext";
import { NavBar } from "@/components/NavBar";
import { VideoLinkCard } from "@/components/VideoLinkCard";
import { ActivityDraftCard } from "@/components/ActivityDraftCard";
import { type ActivityDraft } from "@/components/ActivityFeed";
import { SmartEntryDraftCard } from "@/components/SmartEntryDraftCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { YoutubeVideoResponse } from "@/api/youtube";
import type { ContentTypeFilter } from "@/components/ContentTypeTabs";
import { SettingsDialog } from "@/components/SettingsDialog";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { TwoColumnDetailLayout } from "@/components/TwoColumnDetailLayout";
import { StickyHeaderScrollableCard } from "@/components/StickyHeaderScrollableCard";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function JournalDetailPage() {
  const { journalId } = useParams<{ journalId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"content" | "prompt">("content");
  const [promptDraft, setPromptDraft] = useState<ActivityDraft | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [isStopDialogOpen, setIsStopDialogOpen] = useState(false);
  const { setFocus } = useAgentConversationContext();

  const entryQuery = useQuery({
    ...(journalId
      ? entriesQueries.byId(journalId)
      : entriesQueries.byId("missing")),
    enabled: Boolean(journalId),
  });

  const currentEntry: Entry | null = entryQuery.data ?? null;
  const isSmartEntry = Boolean(currentEntry?.promptBody);
  const {
    isUpdating: isSmartUpdating,
    streamedContent: smartUpdateText,
    latestToolCall: smartUpdateToolCall,
    error: smartUpdateError,
    startUpdate: startSmartUpdate,
  } = useSmartEntryUpdate({
    entryId: currentEntry?.id ?? null,
    enabled: isSmartEntry,
  });

  useEffect(() => {
    if (!journalId) {
      setFocus(null);
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    if (typeof window.matchMedia !== "function") {
      setFocus(null);
      return;
    }
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    if (!isDesktop) {
      setFocus(null);
      return;
    }
    setFocus({
      category: currentEntry?.category ?? "journal",
      id: currentEntry?.id ?? journalId,
      title: currentEntry?.title ?? null,
      route: `/journals/${journalId}`,
    });
    return () => {
      setFocus(null);
    };
  }, [currentEntry?.category, currentEntry?.id, currentEntry?.title, journalId, setFocus]);

  // Set up editing state
  const editingState = useEntryEditing();
  const { isOnline } = useSync();
  const {
    editingEntryId,
    editingDraft,
    editingError,
    deletingEntryId,
    isUpdating,
    isDeleting,
    startEdit,
    handleEditDraftChange,
    cancelEdit,
    submitEdit,
    deleteEntry,
    togglePin,
    isPinning,
  } = editingState;

  const isEditing = currentEntry?.id === editingEntryId;
  const activityItem = currentEntry ? entryToActivityItem(currentEntry) : null;
  const isPinned = Boolean(currentEntry?.pinned);
  const pinLabel = isPinned ? "Unpin entry" : "Pin entry";
  const isPinDisabled =
    !isOnline || (currentEntry ? isPinning(currentEntry.id) : false);
  const deletionInitiatedRef = useRef(false);

  const promptUpdateMutation = useMutation(
    entriesMutations.update(queryClient, {
      onError: (error) => {
        const message =
          error instanceof Error
            ? error.message
            : "We couldn't update this smart prompt.";
        setPromptError(message);
      },
    }),
  );
  const isPromptUpdating = promptUpdateMutation.isPending;
  const isPromptEditing = Boolean(promptDraft);

  useEffect(() => {
    setActiveTab("content");
    setPromptDraft(null);
    setPromptError(null);
    setIsStopDialogOpen(false);
  }, [currentEntry?.id]);

  useEffect(() => {
    if (!currentEntry || !isSmartEntry) {
      return;
    }
    if (currentEntry.lastSmartUpdateAt || isSmartUpdating || !isOnline) {
      return;
    }
    void startSmartUpdate();
  }, [currentEntry, isSmartEntry, isOnline, isSmartUpdating, startSmartUpdate]);

  const startPromptEdit = useCallback(() => {
    if (!currentEntry || !isSmartEntry) {
      return;
    }
    setPromptDraft({
      title: currentEntry.title,
      summary: "",
      date: currentEntry.date,
      promptBody: currentEntry.promptBody ?? "",
      promptFormat: currentEntry.promptFormat ?? "",
      mode: "smart",
    });
    setPromptError(null);
  }, [currentEntry, isSmartEntry]);

  const handlePromptDraftChange = useCallback((nextDraft: ActivityDraft) => {
    setPromptDraft(nextDraft);
    setPromptError(null);
  }, []);

  const handlePromptSubmit = useCallback(async () => {
    if (!currentEntry || !promptDraft) {
      return;
    }
    if (!isOnline) {
      setPromptError("You are offline. Connect to update the prompt.");
      return;
    }

    const trimmedTitle = promptDraft.title.trim();
    if (trimmedTitle.length === 0) {
      setPromptError("Add a title before saving.");
      return;
    }
    const trimmedPromptBody = (promptDraft.promptBody ?? "").trim();
    if (trimmedPromptBody.length === 0) {
      setPromptError("Describe what Loopie should include.");
      return;
    }

    const trimmedPromptFormat = (promptDraft.promptFormat ?? "").trim();

    try {
      await promptUpdateMutation.mutateAsync({
        id: currentEntry.id,
        title: trimmedTitle,
        promptBody: trimmedPromptBody,
        promptFormat: trimmedPromptFormat.length > 0 ? trimmedPromptFormat : null,
      });
      setPromptDraft(null);
      setPromptError(null);
      setActiveTab("content");
      void startSmartUpdate();
    } catch {
      // handled in mutation onError
    }
  }, [currentEntry, isOnline, promptDraft, promptUpdateMutation, startSmartUpdate]);

  const handleStopSmartUpdates = useCallback(async () => {
    if (!currentEntry) {
      return;
    }
    if (!isOnline) {
      setPromptError("You are offline. Connect to stop smart updates.");
      return;
    }

    try {
      await promptUpdateMutation.mutateAsync({
        id: currentEntry.id,
        promptBody: null,
        promptFormat: null,
      });
      setPromptDraft(null);
      setPromptError(null);
      setActiveTab("content");
      setIsStopDialogOpen(false);
    } catch {
      // handled in mutation onError
    }
  }, [currentEntry, isOnline, promptUpdateMutation]);

  // Track when deletion is initiated
  useEffect(() => {
    if (deletingEntryId && journalId && deletingEntryId === journalId) {
      deletionInitiatedRef.current = true;
    }
  }, [deletingEntryId, journalId]);

  // Redirect to home page if entry is deleted
  useEffect(() => {
    if (
      deletionInitiatedRef.current &&
      journalId &&
      !isDeleting(journalId) &&
      (!currentEntry || entryQuery.isError)
    ) {
      // Entry was successfully deleted, navigate away
      deletionInitiatedRef.current = false;
      void navigate("/");
    }
  }, [currentEntry, entryQuery.isError, journalId, navigate, isDeleting]);

  const createdDate: string | null = currentEntry?.date ?? null;
  const journalDate = useMemo(() => {
    if (!createdDate) {
      return null;
    }
    const parsed = new Date(createdDate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [createdDate]);

  const updatedDateValue = useMemo(() => {
    const updatedDate = currentEntry?.updatedAt ?? currentEntry?.date;
    if (!updatedDate) {
      return null;
    }
    const parsed = new Date(updatedDate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [currentEntry?.date, currentEntry?.updatedAt]);

  const formattedUpdatedDate = updatedDateValue
    ? updatedDateValue.toLocaleString(undefined, {
        dateStyle: "long",
        timeStyle: "short",
      })
    : null;

  const formattedCreatedDate = journalDate
    ? journalDate.toLocaleString(undefined, {
        dateStyle: "long",
        timeStyle: "short",
      })
    : null;

  const lastSmartUpdateDate = useMemo(() => {
    if (!currentEntry?.lastSmartUpdateAt) {
      return null;
    }
    const parsed = new Date(currentEntry.lastSmartUpdateAt);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [currentEntry?.lastSmartUpdateAt]);

  const formattedLastSmartUpdate = lastSmartUpdateDate
    ? lastSmartUpdateDate.toLocaleString(undefined, {
        dateStyle: "long",
        timeStyle: "short",
      })
    : null;

  const summarySource: string | null = currentEntry?.summary ?? null;
  const summaryText =
    typeof summarySource === "string" ? summarySource.trim() : "";

  // Read filter state from localStorage (same as ActivityFeed)
  const [contentTypeFilter] = useLocalStorageState<ContentTypeFilter>(
    "contentTypeFilter",
    {
      defaultValue: "all",
    },
  );

  const [publicOnly] = useLocalStorageState<boolean>("publicOnlyFilter", {
    defaultValue: true,
  });

  // Determine videoType filter for API calls: null if "all", otherwise the type
  const videoTypeFilter = useMemo<"short" | "video" | "live" | null>(() => {
    if (contentTypeFilter === "all") {
      return null;
    }
    return contentTypeFilter;
  }, [contentTypeFilter]);

  const youtubeState = useYouTubeFeed(videoTypeFilter);

  const adjacentVideos = useMemo(() => {
    if (!youtubeState.youtubeFeed?.videos || !journalDate) {
      return { previous: null, next: null };
    }

    // Apply the same filtering logic as ActivityFeed
    const filteredVideos = youtubeState.youtubeFeed.videos.filter((video) => {
      // Filter by content type
      if (!video.videoType) {
        // Include items without videoType only if not filtering by type
        if (contentTypeFilter !== "all") return false;
      } else {
        if (contentTypeFilter !== "all") {
          if (video.videoType !== contentTypeFilter) return false;
        }
      }

      // Filter by privacy status if "public only" is enabled
      if (publicOnly) {
        // Only include public videos (exclude unlisted and private)
        if (video.privacyStatus !== "public") return false;
      }

      return true;
    });

    const sortedVideos = [...filteredVideos].sort(
      (a, b) =>
        new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime(),
    );

    let previous: YoutubeVideoResponse | null = null;
    let next: YoutubeVideoResponse | null = null;
    const journalTime = journalDate.getTime();

    for (const video of sortedVideos) {
      const publishedTime = new Date(video.publishedAt).getTime();
      if (Number.isNaN(publishedTime)) {
        continue;
      }
      if (publishedTime <= journalTime) {
        previous = video;
        continue;
      }
      if (!next && publishedTime > journalTime) {
        next = video;
        break;
      }
    }

    return { previous, next };
  }, [
    journalDate,
    youtubeState.youtubeFeed?.videos,
    contentTypeFilter,
    publicOnly,
  ]);

  const renderVideoCard = (
    label: string,
    video: YoutubeVideoResponse | null,
    emptyMessage: string,
  ) => {
    if (!youtubeState.isLinked) {
      return (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Link your YouTube account to see videos near this journal entry.
          </CardContent>
        </Card>
      );
    }

    if (youtubeState.youtubeError) {
      return (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            {youtubeState.youtubeError}
          </CardContent>
        </Card>
      );
    }

    if (youtubeState.isLoading) {
      return (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Loading videos…
          </CardContent>
        </Card>
      );
    }

    if (!video) {
      return (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            {emptyMessage}
          </CardContent>
        </Card>
      );
    }

    return <VideoLinkCard video={video} contextLabel={label} />;
  };

  const backLink = (
    <Link
      to="/"
      className="text-sm font-medium text-primary underline-offset-2 hover:underline"
    >
      ← Back to activity feed
    </Link>
  );

  const renderCardContent = () => {
    if (!journalId) {
      return (
        <StickyHeaderScrollableCard>
          <p className="text-sm text-muted-foreground">
            We couldn’t determine which journal entry to display.
          </p>
        </StickyHeaderScrollableCard>
      );
    }

    if (entryQuery.isLoading) {
      return (
        <StickyHeaderScrollableCard>
          <p className="text-sm text-muted-foreground">
            Loading journal entry…
          </p>
        </StickyHeaderScrollableCard>
      );
    }

    if (entryQuery.isError) {
      return (
        <StickyHeaderScrollableCard>
          <p className="text-sm text-destructive">
            {entryQuery.error instanceof Error
              ? entryQuery.error.message
              : String(entryQuery.error)}
          </p>
        </StickyHeaderScrollableCard>
      );
    }

    if (!currentEntry) {
      return (
        <StickyHeaderScrollableCard>
          <p className="text-sm text-muted-foreground">
            We couldn't find this journal entry.
          </p>
        </StickyHeaderScrollableCard>
      );
    }

    if (isEditing && editingDraft) {
      return (
        <StickyHeaderScrollableCard bodyClassName="space-y-6">
          <ActivityDraftCard
            draft={editingDraft}
            onChange={handleEditDraftChange}
            onCancel={cancelEdit}
            onSubmit={() => {
              void submitEdit();
            }}
            isSubmitting={isUpdating}
            errorMessage={editingError}
            submitLabel="Save changes"
            category={currentEntry.category}
            idPrefix={`edit-entry-${currentEntry.id}`}
            onDelete={() => {
              void deleteEntry(currentEntry.id);
            }}
            isDeleting={isDeleting(currentEntry.id)}
          />

          <div className="h-px w-full bg-border" aria-hidden="true" />

          <div className="grid gap-4 md:grid-cols-2">
            {renderVideoCard(
              "Published before this journal",
              adjacentVideos.previous,
              "No earlier video yet—this journal leads the way!",
            )}
            {renderVideoCard(
              "Published after this journal",
              adjacentVideos.next,
              "Looking forward to your next video!",
            )}
          </div>
        </StickyHeaderScrollableCard>
      );
    }

    const editLabel =
      isSmartEntry && activeTab === "prompt" ? "Edit prompt" : "Edit entry";
    const editDisabledReason = !isOnline
      ? "You are offline"
      : isSmartUpdating
        ? "Loopie is updating this entry"
        : isPromptUpdating
          ? "Updating..."
          : null;
    const isEditButtonDisabled =
      Boolean(editDisabledReason) || (activeTab === "prompt" && isPromptEditing);

    const editButton = isEditButtonDisabled ? (
      editDisabledReason ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={true}>
              {editLabel}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{editDisabledReason}</TooltipContent>
        </Tooltip>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled={true}>
          {editLabel}
        </Button>
      )
    ) : (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          if (!activityItem) {
            return;
          }
          if (isSmartEntry && activeTab === "prompt") {
            startPromptEdit();
            return;
          }
          startEdit(activityItem);
        }}
      >
        {editLabel}
      </Button>
    );

    const header = (
      <>
        <div className="space-y-2">
          {isSmartEntry ? (
            <Badge variant="secondary" className="w-fit bg-primary/10 text-primary">
              <Bot className="h-4 w-4" aria-hidden="true" />
              <span>journal</span>
            </Badge>
          ) : null}
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-semibold text-foreground">
              {currentEntry.title}
            </h1>
            {activityItem ? (
              <div className="flex items-center gap-2">
                {editButton}
                {isPinDisabled ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={true}
                        aria-label={pinLabel}
                        className={
                          isPinned ? "text-primary" : "text-muted-foreground"
                        }
                      >
                        <Pin
                          className="h-4 w-4"
                          fill={isPinned ? "currentColor" : "none"}
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {!isOnline ? "You are offline" : "Updating..."}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (!currentEntry) {
                        return;
                      }
                      void togglePin(currentEntry.id, !isPinned);
                    }}
                    aria-label={pinLabel}
                    className={
                      isPinned ? "text-primary" : "text-muted-foreground"
                    }
                  >
                    <Pin
                      className="h-4 w-4"
                      fill={isPinned ? "currentColor" : "none"}
                    />
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          {formattedUpdatedDate ? (
            formattedCreatedDate ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-default">
                    Updated {formattedUpdatedDate}
                  </span>
                </TooltipTrigger>
                <TooltipContent>Created {formattedCreatedDate}</TooltipContent>
              </Tooltip>
            ) : (
              <span>Updated {formattedUpdatedDate}</span>
            )
          ) : (
            <span>Entry date unavailable</span>
          )}
          {isSmartEntry ? (
            <span className="text-xs text-muted-foreground">
              {formattedLastSmartUpdate
                ? `Loopie updated ${formattedLastSmartUpdate}`
                : "Loopie hasn't updated yet"}
            </span>
          ) : null}
        </div>
      </>
    );

    const promptActionsDisabled = !isOnline || isPromptUpdating || isSmartUpdating;

    const promptTab = (
      <div className="space-y-4">
        {promptDraft ? (
          <SmartEntryDraftCard
            draft={promptDraft}
            onChange={handlePromptDraftChange}
            onCancel={() => setPromptDraft(null)}
            onSubmit={() => {
              void handlePromptSubmit();
            }}
            isSubmitting={isPromptUpdating}
            errorMessage={promptError}
            submitLabel="Save prompt"
            idPrefix={`edit-prompt-${currentEntry.id}`}
          />
        ) : (
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  What to include
                </p>
                <p className="whitespace-pre-line text-sm text-foreground">
                  {currentEntry.promptBody}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Format
                </p>
                <p className="whitespace-pre-line text-sm text-foreground">
                  {currentEntry.promptFormat?.trim().length
                    ? currentEntry.promptFormat
                    : "No format guidance yet."}
                </p>
              </div>
              {promptError ? (
                <p className="text-xs text-destructive">{promptError}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={startPromptEdit}
                  disabled={promptActionsDisabled}
                >
                  Edit prompt
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setIsStopDialogOpen(true)}
                  disabled={promptActionsDisabled}
                >
                  Stop smart updates
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        <Dialog open={isStopDialogOpen} onOpenChange={setIsStopDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Stop smart updates?</DialogTitle>
              <DialogDescription>
                This will remove the smart prompt and stop Loopie from updating
                this journal. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsStopDialogOpen(false)}
                disabled={isPromptUpdating}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  void handleStopSmartUpdates();
                }}
                disabled={isPromptUpdating}
              >
                {isPromptUpdating ? "Stopping…" : "Stop smart updates"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );

    const showWaitingForFirstUpdate =
      isSmartEntry &&
      !isSmartUpdating &&
      !currentEntry.lastSmartUpdateAt &&
      summaryText.length === 0;

    const contentTab = (
      <>
        {isSmartUpdating ? (
          smartUpdateText.trim().length > 0 ? (
            <MarkdownMessage
              content={smartUpdateText}
              className="text-muted-foreground"
            />
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Bot className="h-4 w-4 animate-bounce text-primary" />
              Loopie is drafting this update…
            </div>
          )
        ) : summaryText.length > 0 ? (
          <MarkdownMessage
            content={summaryText}
            className="text-muted-foreground"
          />
        ) : showWaitingForFirstUpdate ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bot className="h-4 w-4 animate-bounce text-primary" />
            {isOnline
              ? "Loopie is preparing the first update."
              : "Loopie will update once you're back online."}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No notes saved for this journal entry.
          </p>
        )}
        {isSmartUpdating && smartUpdateToolCall ? (
          <p className="text-xs text-muted-foreground">{smartUpdateToolCall}</p>
        ) : null}
        {smartUpdateError ? (
          <p className="text-xs text-destructive">{smartUpdateError}</p>
        ) : null}
      </>
    );

    const tabs = isSmartEntry ? (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={activeTab === "content" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("content")}
          disabled={isPromptEditing}
        >
          Content
        </Button>
        <Button
          type="button"
          variant={activeTab === "prompt" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("prompt")}
          disabled={isPromptEditing}
        >
          Prompt
        </Button>
      </div>
    ) : null;

    const body = (
      <>
        {tabs}
        {isSmartEntry && activeTab === "prompt" ? promptTab : contentTab}
      </>
    );

    const footer = (
      <>
        <div className="h-px w-full bg-border" aria-hidden="true" />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {renderVideoCard(
            "Published before this journal",
            adjacentVideos.previous,
            "No earlier video yet—this journal leads the way!",
          )}
          {renderVideoCard(
            "Published after this journal",
            adjacentVideos.next,
            "Looking forward to your next video!",
          )}
        </div>
      </>
    );

    return (
      <StickyHeaderScrollableCard
        header={header}
        stickyHeaderAt="lg"
        footerStickToBottomWhenShort={true}
        footer={footer}
      >
        {body}
      </StickyHeaderScrollableCard>
    );
  };

  return (
    <>
      <div className="to-muted/12 relative min-h-screen bg-gradient-to-br from-background text-foreground">
        <NavBar onOpenSettings={() => setIsSettingsOpen(true)} />
        <main className="relative flex min-h-[calc(100vh-4rem)] flex-1 overflow-y-auto pt-16 lg:h-[100dvh] lg:min-h-0 lg:overflow-hidden">
          <div className="from-primary/8 pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b via-transparent to-transparent" />
          <TwoColumnDetailLayout
            leftTop={backLink}
            left={renderCardContent()}
          />
        </main>
      </div>
      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </>
  );
}

export default JournalDetailPage;
