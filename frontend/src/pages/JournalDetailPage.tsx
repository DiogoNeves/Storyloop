import { useCallback, useMemo, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Pin, SaveOff, Trash2 } from "lucide-react";
import { Link, useLocation, useParams, useNavigate } from "react-router-dom";
import useLocalStorageState from "use-local-storage-state";

import { entriesMutations, entriesQueries, type Entry } from "@/api/entries";
import { useJournalEntryDraft } from "@/hooks/useJournalEntryDraft";
import { useYouTubeFeed } from "@/hooks/useYouTubeFeed";
import { useEntryEditing } from "@/hooks/useEntryEditing";
import { useSmartEntryUpdate } from "@/hooks/useSmartEntryUpdate";
import { useSync } from "@/hooks/useSync";
import { compareEntriesByPinnedDate } from "@/lib/types/entries";
import { cn } from "@/lib/utils";
import { useAgentConversationContext } from "@/context/AgentConversationContext";
import { NavBar } from "@/components/NavBar";
import { VideoLinkCard } from "@/components/VideoLinkCard";
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
  type JournalEntryEditorHandle,
  JournalEntryEditor,
} from "@/components/JournalEntryEditor";
import { NewEntryHeader } from "@/components/NewEntryHeader";

export function JournalDetailPage() {
  const { journalId } = useParams<{ journalId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"content" | "prompt">("content");
  const [promptDraft, setPromptDraft] = useState<ActivityDraft | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [isStopDialogOpen, setIsStopDialogOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const { setFocus } = useAgentConversationContext();
  const editorRef = useRef<JournalEntryEditorHandle | null>(null);

  const isNewEntryRoute =
    journalId === "new" || location.pathname === "/journals/new";

  const entryQuery = useQuery({
    ...(journalId && !isNewEntryRoute
      ? entriesQueries.byId(journalId)
      : entriesQueries.byId("missing")),
    enabled: Boolean(journalId && !isNewEntryRoute),
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

  const {
    titleDraft,
    setTitleDraft,
    setSummaryDraft,
    editorInitialSummary,
    autosaveStatus,
    autosaveError,
  } = useJournalEntryDraft({
    currentEntry,
    isNewEntryRoute,
    isSmartEntry,
    isSmartUpdating,
  });

  useEffect(() => {
    if (!journalId || isNewEntryRoute) {
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
  }, [
    currentEntry?.category,
    currentEntry?.id,
    currentEntry?.title,
    isNewEntryRoute,
    journalId,
    setFocus,
  ]);

  // Set up editing state
  const editingState = useEntryEditing();
  const { isOnline, pendingEntryUpdates } = useSync();
  const {
    deletingEntryId,
    isDeleting,
    deleteEntry,
    togglePin,
    isPinning,
  } = editingState;
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

  const createEntryMutation = useMutation(
    entriesMutations.create(queryClient, {
      onSuccess: (savedEntry) => {
        if (!savedEntry) {
          return;
        }
        const listQuery = entriesQueries.all();
        queryClient.setQueryData<Entry[]>(
          listQuery.queryKey,
          (current) => {
            const next = (current ?? []).filter(
              (entry) => entry.id !== savedEntry.id,
            );
            next.push(savedEntry);
            next.sort(compareEntriesByPinnedDate);
            return next;
          },
        );
      },
    }),
  );

  useEffect(() => {
    setActiveTab("content");
    setPromptDraft(null);
    setPromptError(null);
    setIsStopDialogOpen(false);
  }, [currentEntry?.id]);

  useEffect(() => {
    if (isNewEntryRoute) {
      setCreateError(null);
    }
  }, [isNewEntryRoute]);

  useEffect(() => {
    if (!currentEntry || !isSmartEntry) {
      return;
    }
    if (currentEntry.lastSmartUpdateAt || isSmartUpdating || !isOnline) {
      return;
    }
    void startSmartUpdate();
  }, [currentEntry, isSmartEntry, isOnline, isSmartUpdating, startSmartUpdate]);

  const shouldAutoFocusEditor = Boolean(
    (location.state as { focusEditor?: boolean } | null)?.focusEditor,
  );

  useEffect(() => {
    if (!shouldAutoFocusEditor || !currentEntry) {
      return;
    }
    // Use requestAnimationFrame to ensure the editor is fully rendered
    requestAnimationFrame(() => {
      setTimeout(() => {
        editorRef.current?.focus();
      }, 50);
    });
    void navigate(location.pathname, { replace: true, state: {} });
  }, [currentEntry, location.pathname, navigate, shouldAutoFocusEditor]);

  const startPromptEdit = useCallback(() => {
    if (!currentEntry || !isSmartEntry) {
      return;
    }
    setPromptDraft({
      title: titleDraft,
      summary: "",
      date: currentEntry.date,
      promptBody: currentEntry.promptBody ?? "",
      promptFormat: currentEntry.promptFormat ?? "",
      mode: "smart",
    });
    setPromptError(null);
  }, [currentEntry, isSmartEntry, titleDraft]);

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

  const handleCreateEntry = useCallback(async () => {
    if (!isNewEntryRoute) {
      return;
    }
    if (!isOnline) {
      setCreateError("Go online to create.");
      return;
    }
    const trimmedTitle = titleDraft.trim();
    if (trimmedTitle.length === 0) {
      setCreateError("Add a title before creating.");
      return;
    }

    const entryId = crypto.randomUUID();
    try {
      const savedEntry = await createEntryMutation.mutateAsync({
        id: entryId,
        title: trimmedTitle,
        summary: "",
        date: new Date().toISOString(),
        category: "journal",
        pinned: false,
      });
      if (!savedEntry) {
        setCreateError("This entry already exists.");
        return;
      }
      setCreateError(null);
      void navigate(`/journals/${savedEntry.id}`, {
        state: { focusEditor: true },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "We couldn't create this entry. Please try again.";
      setCreateError(message);
    }
  }, [createEntryMutation, isNewEntryRoute, isOnline, navigate, titleDraft]);

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

  const pendingUpdateForEntry = currentEntry
    ? pendingEntryUpdates.find((update) => update.id === currentEntry.id)
    : null;
  const hasPendingUpdate = Boolean(pendingUpdateForEntry);

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
    if (!journalId && !isNewEntryRoute) {
      return (
        <StickyHeaderScrollableCard>
          <p className="text-sm text-muted-foreground">
            We couldn’t determine which journal entry to display.
          </p>
        </StickyHeaderScrollableCard>
      );
    }

    if (isNewEntryRoute) {
      const header = (
        <NewEntryHeader
          title={titleDraft}
          onTitleChange={setTitleDraft}
          createError={createError}
          onClearError={() => setCreateError(null)}
          isOnline={isOnline}
          isCreating={createEntryMutation.isPending}
          onCreate={() => {
            void handleCreateEntry();
          }}
        />
      );

      return (
        <StickyHeaderScrollableCard header={header} stickyHeaderAt="lg">
          <div className="space-y-4 pt-4">
            <JournalEntryEditor
              ref={editorRef}
              initialValue={editorInitialSummary}
              resetKey="new-entry"
              onChange={setSummaryDraft}
              isEditable={false}
            />
            <p className="text-xs text-muted-foreground">
              Add a title and create the entry to start writing.
            </p>
          </div>
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

    const promptActionsDisabled = !isOnline || isPromptUpdating || isSmartUpdating;

    const editDisabledReason = !isOnline
      ? "You are offline"
      : isSmartUpdating
        ? "Loopie is updating this entry"
        : isPromptUpdating
          ? "Updating..."
          : null;
    const isEditButtonDisabled =
      Boolean(editDisabledReason) || isPromptEditing;

    const editPromptButton = isSmartEntry ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isEditButtonDisabled}
        title={editDisabledReason ?? undefined}
        onClick={() => {
          if (isEditButtonDisabled) {
            return;
          }
          startPromptEdit();
          setActiveTab("prompt");
        }}
      >
        Edit prompt
      </Button>
    ) : null;

    const showStopSmartUpdates = isSmartEntry && activeTab === "prompt";
    const stopSmartUpdatesButton = (
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={promptActionsDisabled}
        title={editDisabledReason ?? undefined}
        onClick={() => {
          if (promptActionsDisabled) {
            return;
          }
          setIsStopDialogOpen(true);
        }}
      >
        Stop smart updates
      </Button>
    );

    const showSaveIndicator =
      autosaveStatus === "queued"
        ? hasPendingUpdate
        : autosaveStatus !== "idle" || hasPendingUpdate;
    const saveIndicatorTone =
      autosaveStatus === "error"
        ? "text-destructive"
        : autosaveStatus === "queued" || hasPendingUpdate
          ? "text-amber-500"
          : "text-muted-foreground";
    const saveIndicatorMessage =
      autosaveStatus === "saving"
        ? "Saving..."
        : autosaveStatus === "error"
          ? autosaveError ?? "Saved locally, couldn’t sync yet."
          : autosaveStatus === "dirty"
            ? "Unsaved changes"
            : hasPendingUpdate
              ? "Saved locally, syncing soon."
              : "Saved locally";

    const header = (
      <>
        <div className="space-y-2">
          {isSmartEntry ? (
            <Badge variant="secondary" className="w-fit bg-primary/10 text-primary">
              <Bot className="h-4 w-4" aria-hidden="true" />
              <span>journal</span>
            </Badge>
          ) : null}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-1 items-start gap-3">
              <input
                className="w-full flex-1 border-none bg-transparent text-2xl font-semibold text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:text-muted-foreground"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                disabled={isSmartUpdating}
                placeholder="Untitled entry"
              />
              {showSaveIndicator ? (
                <span
                  className={cn("mt-2 inline-flex items-center", saveIndicatorTone)}
                  title={saveIndicatorMessage}
                  aria-label={saveIndicatorMessage}
                >
                  <SaveOff
                    className={cn(
                      "h-4 w-4",
                      autosaveStatus === "saving" && "animate-bounce",
                    )}
                  />
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {showStopSmartUpdates ? stopSmartUpdatesButton : null}
              {editPromptButton}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={isPinDisabled}
                title={
                  isPinDisabled
                    ? !isOnline
                      ? "You are offline"
                      : "Updating..."
                    : undefined
                }
                onClick={() => {
                  if (!currentEntry || isPinDisabled) {
                    return;
                  }
                  void togglePin(currentEntry.id, !isPinned);
                }}
                aria-label={pinLabel}
                className={isPinned ? "text-primary" : "text-muted-foreground"}
              >
                <Pin
                  className="h-4 w-4"
                  fill={isPinned ? "currentColor" : "none"}
                />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (!isOnline || isDeleting(currentEntry.id)) {
                    return;
                  }
                  void deleteEntry(currentEntry.id);
                }}
                disabled={!isOnline || isDeleting(currentEntry.id)}
                title={!isOnline ? "You are offline" : undefined}
                aria-label="Delete entry"
                className="text-muted-foreground"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1">
            {formattedUpdatedDate ? (
              <span>Updated {formattedUpdatedDate}</span>
            ) : (
              <span>Entry date unavailable</span>
            )}
            {formattedCreatedDate ? (
              <span>Created {formattedCreatedDate}</span>
            ) : null}
          </div>
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

    const promptMarkdown = (() => {
      const promptBody = currentEntry.promptBody ?? "";
      const promptFormat = currentEntry.promptFormat?.trim().length
        ? currentEntry.promptFormat
        : "No format guidance yet.";
      return `## What to include\n\n${promptBody}\n\n## Format\n\n${promptFormat}`;
    })();

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
          <MarkdownMessage
            content={promptMarkdown}
            className="text-muted-foreground"
          />
        )}
        {promptError ? (
          <p className="text-xs text-destructive">{promptError}</p>
        ) : null}
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
        ) : !isSmartEntry ? (
          <JournalEntryEditor
            ref={editorRef}
            initialValue={editorInitialSummary}
            resetKey={currentEntry.id}
            onChange={setSummaryDraft}
            isEditable={!isSmartUpdating}
          />
        ) : summaryText.length > 0 ? (
          <JournalEntryEditor
            ref={editorRef}
            initialValue={editorInitialSummary}
            resetKey={currentEntry.id}
            onChange={setSummaryDraft}
            isEditable={!isSmartUpdating}
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
      <div className="space-y-6 pt-4">
        {tabs}
        {isSmartEntry && activeTab === "prompt" ? promptTab : contentTab}
      </div>
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
