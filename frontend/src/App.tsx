import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import useLocalStorageState from "use-local-storage-state";

import { ActivityFeed, type ActivityDraft } from "@/components/ActivityFeed";
import { NavBar } from "@/components/NavBar";
import { AgentPanel } from "@/components/AgentPanel";
import {
  ContentTypeTabs,
  type ContentTypeFilter,
} from "@/components/ContentTypeTabs";
import { SettingsDialog } from "@/components/SettingsDialog";
import {
  entriesMutations,
  entriesQueries,
  type CreateEntryInput,
  type Entry,
} from "@/api/entries";
import {
  conversationQueries,
  deleteConversation,
} from "@/api/conversations";
import { growthQueries } from "@/api/growth";
import { healthQueries } from "@/api/health";
import { type ActivityItem, entryToActivityItem } from "@/lib/types/entries";
import { useYouTubeFeed } from "@/hooks/useYouTubeFeed";
import { YoutubeAuthCallback } from "@/pages/YoutubeAuthCallback";
import { VideoDetailPage } from "@/pages/VideoDetailPage";
import { JournalDetailPage } from "@/pages/JournalDetailPage";
import { InsightsPage } from "@/pages/InsightsPage";
import { ConversationDetailPage } from "@/pages/ConversationDetailPage";
import { JournalSummaryCards } from "@/components/JournalSummaryCards";
import {
  AgentConversationProvider,
  useAgentConversationContext,
} from "@/context/AgentConversationContext";
import { SettingsProvider } from "@/context/SettingsProvider";
import { useSettings } from "@/context/useSettings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      staleTime: 60_000,
    },
  },
});

function AppLayout() {
  const location = useLocation();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="to-muted/12 flex h-screen flex-col overflow-hidden bg-gradient-to-br from-background text-foreground">
      <NavBar onOpenSettings={() => setIsSettingsOpen(true)} />
      <main className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="from-primary/8 pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b via-transparent to-transparent" />
        <div className="relative grid h-full min-h-0 w-full grid-cols-3 gap-6 px-6 py-12 lg:px-10 xl:px-16">
          <div className="scrollbar-hide col-span-2 flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-hidden">
            <div className="flex h-full min-h-0 flex-col">
              <Outlet key={location.pathname} />
            </div>
          </div>
          <div className="col-span-1 flex h-full min-h-0">
            <AgentPanel />
          </div>
        </div>
      </main>
      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </div>
  );
}

function JournalPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { setActiveConversation, state: agentConversationState } =
    useAgentConversationContext();

  // Content type filter state - persisted in local storage
  const [contentTypeFilter, setContentTypeFilter] =
    useLocalStorageState<ContentTypeFilter>("contentTypeFilter", {
      defaultValue: "all",
    });

  const { publicOnly, setPublicOnly } = useSettings();
  void setPublicOnly;

  // Determine videoType filter for API calls: null if "all", otherwise the type
  const videoTypeFilter = useMemo<"short" | "video" | "live" | null>(() => {
    if (contentTypeFilter === "all") {
      return null;
    }
    return contentTypeFilter;
  }, [contentTypeFilter]);

  const seedItems = useMemo<ActivityItem[]>(
    () => [
      {
        id: "1",
        title: "Uploaded 'Behind the Scenes at Edit Bay'",
        summary:
          "View duration lifted to 64%. Keep leaning into granular storytelling beats.",
        date: new Date().toISOString(),
        category: "content",
      },
      {
        id: "2",
        title: "Growth insight: Hook iteration working",
        summary:
          "CTR climbed 14% week over week after testing the narrative teaser hook.",
        date: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
        category: "insight",
      },
      {
        id: "3",
        title: "Weekly journal draft",
        summary:
          "Reflect on the edit pace experimentation and the impact on watch curve retention.",
        date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        category: "journal",
      },
    ],
    [],
  );

  const entriesListQuery = useMemo(() => entriesQueries.all(), []);
  const {
    data: storedEntries,
    status: entriesStatus,
    error: entriesError,
  } = useQuery(entriesListQuery);
  const conversationListQuery = useMemo(() => conversationQueries.list(), []);
  const conversationsQuery = useQuery(conversationListQuery);
  const conversationActivityItems = useMemo<ActivityItem[]>(() => {
    if (!conversationsQuery.data) {
      return [];
    }
    return conversationsQuery.data
      .filter((conversation) => (conversation.turnCount ?? 0) > 0)
      .map((conversation) => {
        const firstTurnTitle = conversation.firstTurnText?.trim();
        const trimmedSummary = conversation.lastTurnText?.trim();
        const title =
          firstTurnTitle && firstTurnTitle.length > 0
            ? firstTurnTitle
            : conversation.title ?? "Loopie conversation";
        return {
          id: conversation.id,
          title,
          summary:
            trimmedSummary && trimmedSummary.length > 0
              ? trimmedSummary
              : "Jump into this Loopie conversation to keep building.",
          date: conversation.lastTurnAt ?? conversation.createdAt,
          category: "conversation" as const,
        };
      });
  }, [conversationsQuery.data]);
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

  const storedActivityItems = useMemo<ActivityItem[]>(() => {
    if (!storedEntries) {
      return [];
    }
    return storedEntries.map(entryToActivityItem);
  }, [storedEntries]);

  // Fetch YouTube videos with filter
  const youtubeState = useYouTubeFeed(videoTypeFilter);

  const growthScoreQuery = useQuery({
    ...growthQueries.score(youtubeState.channelId ?? null),
  });

  const scoreErrorMessage = growthScoreQuery.isError
    ? growthScoreQuery.error instanceof Error
      ? growthScoreQuery.error.message
      : "We couldn't calculate your growth score."
    : null;

  // Build the activity list from conversations, entries, and YouTube videos
  const activityItems = useMemo<ActivityItem[]>(() => {
    const baseItems = [...conversationActivityItems, ...storedActivityItems];

    // Add YouTube videos if available
    if (youtubeState.youtubeFeed?.videos) {
      const videos = Array.isArray(youtubeState.youtubeFeed.videos)
        ? youtubeState.youtubeFeed.videos
        : [];
      const videoItems = videos.map((video) => ({
        id: `youtube:${video.id}`,
        title: video.title,
        summary: video.description,
        date: video.publishedAt,
        category: "content" as const,
        linkUrl: video.url,
        thumbnailUrl: video.thumbnailUrl ?? undefined,
        videoId: video.id,
        videoType: video.videoType,
        privacyStatus: video.privacyStatus,
      }));

      // Filter YouTube videos by selected content type and privacy status
      const filteredVideoItems = videoItems.filter((item) => {
        // Filter by content type
        if (!item.videoType) {
          // Include items without videoType only if not filtering by type
          if (contentTypeFilter !== "all") return false;
        } else {
          if (contentTypeFilter !== "all") {
            if (item.videoType !== contentTypeFilter) return false;
          }
        }

        // Filter by privacy status if "public only" is enabled
        if (publicOnly) {
          // Only include public videos (exclude unlisted and private)
          if (item.privacyStatus !== "public") return false;
        }

        return true;
      });

      const seenIds = new Set(baseItems.map((item) => item.id));
      const uniqueVideoItems = filteredVideoItems.filter((item) => {
        if (seenIds.has(item.id)) {
          return false;
        }
        seenIds.add(item.id);
        return true;
      });

      baseItems.push(...uniqueVideoItems);
    }

    // Sort by date (newest first) and limit to 50
    // Create a new array to avoid mutating the original
    return [...baseItems]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 50);
  }, [
    conversationActivityItems,
    storedActivityItems,
    youtubeState.youtubeFeed,
    contentTypeFilter,
    publicOnly,
  ]);
  const hasActivity =
    conversationActivityItems.length > 0 ||
    storedActivityItems.length > 0 ||
    Boolean(youtubeState.youtubeFeed);
  const displayItems = hasActivity ? activityItems : seedItems;

  const [draft, setDraft] = useState<ActivityDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [conversationDeleteError, setConversationDeleteError] = useState<
    string | null
  >(null);
  const [deletingConversationIds, setDeletingConversationIds] = useState<
    Set<string>
  >(new Set());

  const { mutateAsync: saveEntry, isPending: isSavingEntry } = useMutation({
    ...entriesMutations.create(),
    onSuccess: (savedEntry) => {
      if (!savedEntry) {
        return;
      }
      queryClient.setQueryData<Entry[]>(
        entriesListQuery.queryKey,
        (current) => {
          const next = (current ?? []).filter(
            (entry) => entry.id !== savedEntry.id,
          );
          next.push(savedEntry);
          next.sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
          );
          return next;
        },
      );
    },
  });

  const formatNowAsDateTimeLocal = useCallback(() => {
    const now = new Date();
    now.setSeconds(0);
    now.setMilliseconds(0);
    const offset = now.getTimezoneOffset();
    const adjusted = new Date(now.getTime() - offset * 60_000);
    return adjusted.toISOString().slice(0, 16);
  }, []);

  const handleStartDraft = useCallback(() => {
    if (draft) {
      return;
    }
    setDraft({
      title: "",
      summary: "",
      date: formatNowAsDateTimeLocal(),
    });
    setDraftError(null);
  }, [draft, formatNowAsDateTimeLocal]);

  const handleDraftChange = useCallback((nextDraft: ActivityDraft) => {
    setDraft(nextDraft);
    setDraftError(null);
  }, []);

  const handleCancelDraft = useCallback(() => {
    setDraft(null);
    setDraftError(null);
  }, []);

  const handleSubmitDraft = useCallback(async () => {
    if (!draft) {
      return;
    }

    const trimmedTitle = draft.title.trim();
    const trimmedSummary = draft.summary.trim();
    if (trimmedTitle.length === 0) {
      setDraftError("Add a title before saving.");
      return;
    }

    const entryInput: CreateEntryInput = {
      id: crypto.randomUUID(),
      title: trimmedTitle,
      summary: trimmedSummary,
      date: new Date(draft.date).toISOString(),
      category: "journal",
    };

    try {
      setDraftError(null);
      const savedEntry = await saveEntry(entryInput);
      if (savedEntry) {
        setDraft(null);
      } else {
        setDraftError("This entry was already saved.");
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "We couldn't save your entry. Please try again.";
      setDraftError(message);
    }
  }, [draft, saveEntry]);

  const handleDraftSubmit = useCallback(() => {
    void handleSubmitDraft();
  }, [handleSubmitDraft]);

  const entriesErrorMessage = useMemo(() => {
    if (entriesStatus !== "error") {
      return null;
    }
    if (entriesError instanceof Error) {
      return `We couldn't load saved entries: ${entriesError.message}`;
    }
    return "We couldn't load saved entries.";
  }, [entriesError, entriesStatus]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <JournalSummaryCards
        score={growthScoreQuery.data ?? null}
        isLoading={growthScoreQuery.isPending}
        error={scoreErrorMessage}
      />

      <ContentTypeTabs
        value={contentTypeFilter}
        onChange={setContentTypeFilter}
      />

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
        onConversationDelete={handleConversationDelete}
        deletingConversationIds={deletingConversationIds}
      />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <AgentConversationProvider>
            <Routes>
              <Route path="/" element={<AppLayout />}>
                <Route index element={<JournalPage />} />
                <Route path="journal" element={<JournalPage />} />
                <Route path="insights" element={<InsightsPage />} />
              </Route>
              <Route path="/videos/:videoId" element={<VideoDetailPage />} />
              <Route
                path="/journals/:journalId"
                element={<JournalDetailPage />}
              />
              <Route
                path="/conversations/:conversationId"
                element={<ConversationDetailPage />}
              />
              <Route path="/auth/callback" element={<YoutubeAuthCallback />} />
            </Routes>
          </AgentConversationProvider>
        </SettingsProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export default App;
