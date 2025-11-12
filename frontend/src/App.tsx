import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import useLocalStorageState from "use-local-storage-state";

import { ActivityFeed, type ActivityDraft } from "@/components/ActivityFeed";
import { ChatKitPanel } from "@/components/ChatKitPanel";
import { NavBar } from "@/components/NavBar";
import { ScoreOverviewCard } from "@/components/ScoreOverviewCard";
import {
  ContentTypeTabs,
  type ContentTypeFilter,
} from "@/components/ContentTypeTabs";
import {
  entriesMutations,
  entriesQueries,
  type CreateEntryInput,
  type Entry,
} from "@/api/entries";
import { growthQueries } from "@/api/growth";
import { healthQueries } from "@/api/health";
import { type ActivityItem, entryToActivityItem } from "@/lib/types/entries";
import { useYouTubeFeed } from "@/hooks/useYouTubeFeed";
import { YoutubeAuthCallback } from "@/pages/YoutubeAuthCallback";
import { VideoDetailPage } from "@/pages/VideoDetailPage";
import { JournalDetailPage } from "@/pages/JournalDetailPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      staleTime: 60_000,
    },
  },
});

function ScorePlaceholder({
  channelId,
  contentTypeFilter,
}: {
  channelId: string | null;
  contentTypeFilter: ContentTypeFilter;
}) {
  const growthScoreQuery = useQuery({
    ...growthQueries.score(
      channelId ?? null,
      contentTypeFilter === "all" ? null : contentTypeFilter,
    ),
  });

  const errorMessage = growthScoreQuery.isError
    ? growthScoreQuery.error instanceof Error
      ? growthScoreQuery.error.message
      : "We couldn't calculate your growth score."
    : null;

  return (
    <ScoreOverviewCard
      score={growthScoreQuery.data ?? null}
      isLoading={growthScoreQuery.isPending}
      error={errorMessage}
    />
  );
}

function DashboardShell() {
  const queryClient = useQueryClient();

  // Content type filter state - persisted in local storage
  const [contentTypeFilter, setContentTypeFilter] =
    useLocalStorageState<ContentTypeFilter>("contentTypeFilter", {
      defaultValue: "all",
    });

  // Public only filter state - persisted in local storage
  const [publicOnly, setPublicOnly] = useLocalStorageState<boolean>(
    "publicOnlyFilter",
    {
      defaultValue: true,
    },
  );

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

  const storedActivityItems = useMemo<ActivityItem[]>(() => {
    if (!storedEntries) {
      return [];
    }
    return storedEntries.map(entryToActivityItem);
  }, [storedEntries]);

  // Fetch YouTube videos with filter
  const youtubeState = useYouTubeFeed(videoTypeFilter);

  const healthStatusQuery = useQuery(healthQueries.status());

  // Combine stored entries with YouTube videos, filter by content type, and limit to 50
  const activityItems = useMemo<ActivityItem[]>(() => {
    const baseItems = [...storedActivityItems];

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

      baseItems.push(...filteredVideoItems);
    }

    // Sort by date (newest first) and limit to 50
    // Create a new array to avoid mutating the original
    return [...baseItems]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 50);
  }, [
    storedActivityItems,
    youtubeState.youtubeFeed,
    contentTypeFilter,
    publicOnly,
  ]);

  // Fallback to seed items if no stored entries and no YouTube feed
  const displayItems =
    storedActivityItems.length > 0 || youtubeState.youtubeFeed
      ? activityItems
      : seedItems;

  const [draft, setDraft] = useState<ActivityDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

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
      videoId: "",
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

    const trimmedVideoId = draft.videoId.trim();

    const entryInput: CreateEntryInput = {
      id: crypto.randomUUID(),
      title: trimmedTitle,
      summary: trimmedSummary,
      date: new Date(draft.date).toISOString(),
      category: "journal",
      videoId: trimmedVideoId.length > 0 ? trimmedVideoId : null,
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
    <div className="min-h-screen bg-muted/20 text-foreground">
      <NavBar />
      <div className="mx-auto flex w-full max-w-7xl gap-6 px-6 py-10">
        <main className="flex w-full max-w-6xl flex-col gap-6">
          <ScorePlaceholder
            channelId={youtubeState.channelId}
            contentTypeFilter={contentTypeFilter}
          />

          <ContentTypeTabs
            value={contentTypeFilter}
            onChange={setContentTypeFilter}
            publicOnly={publicOnly}
            onPublicOnlyChange={setPublicOnly}
          />

          <ActivityFeed
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
          />

          <div>
            {healthStatusQuery.isLoading ? (
              <p className="text-xs text-muted-foreground" role="status">
                Checking API health…
              </p>
            ) : healthStatusQuery.isError ? (
              <p className="text-xs text-destructive" role="status">
                We couldn't reach the Storyloop API.
              </p>
            ) : healthStatusQuery.data?.status ? (
              <p className="text-xs text-muted-foreground" role="status">
                {healthStatusQuery.data.status}
              </p>
            ) : null}
          </div>
        </main>
        <aside className="hidden w-80 shrink-0 lg:block">
          <div className="sticky top-6 h-[calc(100vh-3rem)] rounded-lg border bg-background p-4">
            <h2 className="mb-4 text-lg font-semibold">Assistant</h2>
            <ChatKitPanel />
          </div>
        </aside>
      </div>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/" element={<DashboardShell />} />
          <Route path="/videos/:videoId" element={<VideoDetailPage />} />
          <Route path="/journals/:journalId" element={<JournalDetailPage />} />
          <Route path="/auth/callback" element={<YoutubeAuthCallback />} />
        </Routes>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export default App;
