import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import useLocalStorageState from "use-local-storage-state";

import {
  ActivityFeed,
  type ActivityDraft,
  type EntryDraftMode,
} from "@/components/ActivityFeed";
import { NavBar } from "@/components/NavBar";
import { LoopiePanel } from "@/components/LoopiePanel";
import {
  ContentTypeTabs,
  type ContentTypeFilter,
} from "@/components/ContentTypeTabs";
import { TagFilterSection } from "@/components/TagFilterSection";
import { SettingsDialog } from "@/components/SettingsDialog";
import {
  entriesMutations,
  type Entry,
} from "@/api/entries";
import { deleteConversation } from "@/api/conversations";
import { settingsQueries } from "@/api/settings";
import {
  type ActivityItem,
} from "@/lib/types/entries";
import {
  buildJournalEntryInput,
  buildOptimisticJournalEntry,
  isLikelyNetworkError,
  shouldClearActiveTag,
  upsertSortedEntry,
} from "@/lib/journal-page-logic";
import { formatDateTimeLocalInput } from "@/lib/date-time";
import { useActivityItems } from "@/hooks/useActivityItems";
import { YoutubeAuthCallback } from "@/pages/YoutubeAuthCallback";
import { VideoDetailPage } from "@/pages/VideoDetailPage";
import { JournalDetailPage } from "@/pages/JournalDetailPage";
import { ConversationDetailPage } from "@/pages/ConversationDetailPage";
import { LoopiePage } from "@/pages/LoopiePage";
import { ChannelPage } from "@/pages/ChannelPage";
import { Input } from "@/components/ui/input";
import {
  AgentConversationProvider,
  useAgentConversationContext,
} from "@/context/AgentConversationContext";
import { SettingsProvider } from "@/context/SettingsProvider";
import { SyncProvider } from "@/context/SyncProvider";
import { useSettings } from "@/context/useSettings";
import { useSync } from "@/hooks/useSync";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      staleTime: 60_000,
      // Prevent refetch spam when offline - keeps showing cached/stale data
      refetchOnWindowFocus: false,
    },
  },
});

const seedActivityItems: ActivityItem[] = [
  {
    id: "1",
    title: "Uploaded 'Behind the Scenes at Edit Bay'",
    summary:
      "View duration lifted to 64%. Keep leaning into granular storytelling beats. #retention",
    tags: ["retention"],
    date: new Date().toISOString(),
    category: "content",
    archived: false,
  },
  {
    id: "2",
    title: "Hook iteration working",
    summary:
      "CTR climbed 14% week over week after testing the narrative teaser hook. #thumbnail",
    tags: ["thumbnail"],
    date: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    category: "journal",
    archived: false,
  },
  {
    id: "3",
    title: "Weekly journal draft",
    summary:
      "Reflect on the edit pace experimentation and the impact on watch curve retention. #strategy",
    tags: ["strategy"],
    date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    category: "journal",
    archived: false,
  },
];

function AppLayout() {
  const location = useLocation();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const isLoopieRoute = location.pathname.startsWith("/loopie");
  const { pendingCount } = useSync();

  // On mobile, when the sync banner is visible (fixed at top-16), main needs extra padding
  const hasPendingSync = pendingCount > 0;

  return (
    <div className="to-muted/12 relative min-h-screen bg-gradient-to-br from-background text-foreground sm:flex sm:h-screen sm:flex-col sm:overflow-hidden">
      <NavBar onOpenSettings={() => setIsSettingsOpen(true)} />
      <SyncStatusBanner />
      <div className="hidden h-16 flex-shrink-0 sm:block" aria-hidden="true" />
      <main
        className={cn(
          "relative flex min-h-[calc(100vh-4rem)] flex-1 overflow-y-auto sm:min-h-0 sm:flex-1 sm:overflow-hidden sm:pt-0",
          hasPendingSync ? "pt-[6.5rem]" : "pt-16",
          isLoopieRoute ? "h-[100dvh] sm:h-auto" : null,
        )}
      >
        <div className="from-primary/8 pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b via-transparent to-transparent" />
        <div className="relative grid h-full min-h-[calc(100vh-4rem)] w-full grid-cols-1 gap-6 px-2 py-6 sm:min-h-0 sm:py-12 lg:grid-cols-3 lg:overflow-hidden lg:px-10 xl:px-16">
          <div className="scrollbar-hide col-span-2 flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-hidden">
            <div className="flex h-full min-h-0 flex-col">
              <Outlet key={location.pathname} />
            </div>
          </div>
          {!isLoopieRoute ? (
            <div className="col-span-1 hidden h-full min-h-0 lg:flex">
              <LoopiePanel />
            </div>
          ) : null}
        </div>
      </main>
      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </div>
  );
}

function JournalPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const {
    setActiveConversation,
    state: agentConversationState,
    isDemo,
  } = useAgentConversationContext();

  // Content type filter state - persisted in local storage
  const [contentTypeFilter, setContentTypeFilter] =
    useLocalStorageState<ContentTypeFilter>("contentTypeFilter", {
      defaultValue: "all",
    });

  const { publicOnly } = useSettings();
  const settingsQuery = useQuery(settingsQueries.all());
  const showArchived = settingsQuery.data?.showArchived ?? false;
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const {
    activityItems,
    entriesListQuery,
    entriesQuery,
    conversationListQuery,
    youtubeState,
  } = useActivityItems({
    contentTypeFilter,
    publicOnly,
    showArchived,
  });
  const handleConversationClick = useCallback(
    async (conversationId: string) => {
      await setActiveConversation(conversationId);
      void navigate(`/conversations/${conversationId}`);
    },
    [navigate, setActiveConversation],
  );

  const handleConversationDelete = useCallback(
    async (conversationId: string) => {
      setConversationDeleteError(null);
      setDeletingConversationIds((previous) => {
        const next = new Set(previous);
        next.add(conversationId);
        return next;
      });
      try {
        await deleteConversation(conversationId);
        await queryClient.invalidateQueries({
          queryKey: conversationListQuery.queryKey,
        });
        if (agentConversationState.conversationId === conversationId) {
          await setActiveConversation(null);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "We couldn't delete that conversation. Try again.";
        setConversationDeleteError(message);
      } finally {
        setDeletingConversationIds((previous) => {
          const next = new Set(previous);
          next.delete(conversationId);
          return next;
        });
      }
    },
    [
      agentConversationState.conversationId,
      conversationListQuery.queryKey,
      queryClient,
      setActiveConversation,
    ],
  );

  const hasActivity =
    activityItems.length > 0 || Boolean(youtubeState.youtubeFeed);
  const displayItems = hasActivity ? activityItems : seedActivityItems;

  const [draft, setDraft] = useState<ActivityDraft | null>(null);
  const [, setDraftMode] = useState<EntryDraftMode>("standard");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [conversationDeleteError, setConversationDeleteError] = useState<
    string | null
  >(null);
  const [deletingConversationIds, setDeletingConversationIds] = useState<
    Set<string>
  >(new Set());

  const { mutateAsync: saveEntry, isPending: isSavingEntry } = useMutation(
    entriesMutations.create(queryClient, {
      onSuccess: (savedEntry) => {
        if (!savedEntry) {
          return;
        }
        queryClient.setQueryData<Entry[]>(
          entriesListQuery.queryKey,
          (current) => upsertSortedEntry(current, savedEntry),
        );
      },
    }),
  );

  const formatNowAsDateTimeLocal = useCallback(
    () => formatDateTimeLocalInput(new Date()),
    [],
  );

  const handleStartDraft = useCallback(
    (mode: EntryDraftMode) => {
      if (draft) {
        return;
      }
      if (mode === "standard") {
        void navigate("/journals/new");
        return;
      }
      setDraftMode(mode);
      const baseDraft: ActivityDraft = {
        title: "",
        summary: "",
        date: formatNowAsDateTimeLocal(),
        mode,
      };
      setDraft({ ...baseDraft, promptBody: "", promptFormat: "" });
      setDraftError(null);
    },
    [draft, formatNowAsDateTimeLocal, navigate],
  );

  const handleDraftChange = useCallback((nextDraft: ActivityDraft) => {
    setDraft(nextDraft);
    setDraftError(null);
  }, []);

  const handleCancelDraft = useCallback(() => {
    setDraft(null);
    setDraftError(null);
  }, []);

  const { isOnline, queueEntry, markServerUnreachable } = useSync();

  const handleSubmitDraft = useCallback(async () => {
    if (!draft) {
      return;
    }

    const trimmedTitle = draft.title.trim();
    if (trimmedTitle.length === 0) {
      setDraftError("Add a title before saving.");
      return;
    }

    const trimmedPromptBody = (draft.promptBody ?? "").trim();
    if (trimmedPromptBody.length === 0) {
      setDraftError("Describe what Loopie should include before saving.");
      return;
    }

    const entryInput = buildJournalEntryInput(draft, crypto.randomUUID());
    const optimisticUpdatedAt = new Date().toISOString();

    try {
      setDraftError(null);

      if (!isOnline) {
        // Offline: queue for later sync
        await queueEntry(entryInput);
        const optimisticEntry = buildOptimisticJournalEntry(
          entryInput,
          optimisticUpdatedAt,
        );
        queryClient.setQueryData<Entry[]>(
          entriesListQuery.queryKey,
          (current) => upsertSortedEntry(current, optimisticEntry),
        );
        setDraft(null);
        return;
      }

      // Online: normal API call
      const savedEntry = await saveEntry(entryInput);
      if (savedEntry) {
        setDraft(null);
      } else {
        setDraftError("This entry was already saved.");
      }
    } catch (error) {
      // Check if this is a network error (server unreachable)
      const isNetworkError = isLikelyNetworkError(error);

      if (isNetworkError) {
        // Mark server as unreachable so UI shows offline indicator
        markServerUnreachable();
        // Silent fallback: queue entry + optimistic UI
        await queueEntry(entryInput);
        const optimisticEntry = buildOptimisticJournalEntry(
          entryInput,
          optimisticUpdatedAt,
        );
        queryClient.setQueryData<Entry[]>(
          entriesListQuery.queryKey,
          (current) => upsertSortedEntry(current, optimisticEntry),
        );
        setDraft(null);
        return;
      }

      // Non-network errors: show error message
      const message =
        error instanceof Error
          ? error.message
          : "We couldn't save your entry. Please try again.";
      setDraftError(message);
    }
  }, [
    draft,
    saveEntry,
    isOnline,
    queueEntry,
    markServerUnreachable,
    queryClient,
    entriesListQuery.queryKey,
  ]);

  const handleDraftSubmit = useCallback(() => {
    void handleSubmitDraft();
  }, [handleSubmitDraft]);

  const entriesErrorMessage = useMemo(() => {
    if (entriesQuery.status !== "error") {
      return null;
    }
    if (entriesQuery.error instanceof Error) {
      return `We couldn't load saved entries: ${entriesQuery.error.message}`;
    }
    return "We couldn't load saved entries.";
  }, [entriesQuery.error, entriesQuery.status]);

  useEffect(() => {
    if (shouldClearActiveTag(activeTag, displayItems)) {
      setActiveTag(null);
    }
  }, [activeTag, displayItems]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 sm:gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <ContentTypeTabs
            value={contentTypeFilter}
            onChange={setContentTypeFilter}
          />
          <TagFilterSection
            items={displayItems}
            activeTag={activeTag}
            onTagSelect={setActiveTag}
          />
        </div>
        <div className="w-full p-4 sm:max-w-[260px] md:p-1">
          <Input
            className="text-base sm:text-sm"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search activity"
            aria-label="Search activity"
          />
        </div>
      </div>

      <ActivityFeed
        className="flex-1"
        items={displayItems}
        youtubeFeed={youtubeState.youtubeFeed}
        isLinked={youtubeState.isLinked}
        linkStatus={youtubeState.linkStatus}
        youtubeError={youtubeState.youtubeError}
        draft={draft}
        onStartDraft={handleStartDraft}
        onDraftChange={handleDraftChange}
        onCancelDraft={handleCancelDraft}
        onSubmitDraft={handleDraftSubmit}
        isSubmittingDraft={isSavingEntry}
        draftError={draftError}
        errorMessage={entriesErrorMessage}
        conversationErrorMessage={conversationDeleteError}
        onConversationClick={handleConversationClick}
        onConversationDelete={isDemo ? undefined : handleConversationDelete}
        deletingConversationIds={deletingConversationIds}
        searchQuery={searchQuery}
        tagFilter={activeTag}
      />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <SettingsProvider>
            <SyncProvider>
              <AgentConversationProvider>
                <Routes>
                  <Route path="/" element={<AppLayout />}>
                    <Route index element={<JournalPage />} />
                    <Route path="journal" element={<JournalPage />} />
                    <Route path="channel" element={<ChannelPage />} />
                    <Route path="loopie" element={<LoopiePage />} />
                  </Route>
                  <Route path="/journals/new" element={<JournalDetailPage />} />
                  <Route
                    path="/videos/:videoId"
                    element={<VideoDetailPage />}
                  />
                  <Route
                    path="/journals/:journalId"
                    element={<JournalDetailPage />}
                  />
                  <Route
                    path="/conversations/:conversationId"
                    element={<ConversationDetailPage />}
                  />
                  <Route
                    path="/auth/callback"
                    element={<YoutubeAuthCallback />}
                  />
                </Routes>
              </AgentConversationProvider>
            </SyncProvider>
          </SettingsProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export default App;
