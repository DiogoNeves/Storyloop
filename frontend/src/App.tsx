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
import { healthQueries } from "@/api/health";
import { growthQueries } from "@/api/growth";
import { cn } from "@/lib/utils";
import { type ActivityItem, entryToActivityItem } from "@/lib/types/entries";
import { useYouTubeFeed } from "@/hooks/useYouTubeFeed";
import { YoutubeAuthCallback } from "@/pages/YoutubeAuthCallback";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      staleTime: 60_000,
    },
  },
});

function HealthBadge({ className }: { className?: string }) {
  const { data, status, error } = useQuery(healthQueries.status());

  const label =
    status === "pending"
      ? "Checking backend…"
      : status === "error"
        ? "API offline"
        : (data?.status ?? "API ready");

  const badgeClassName =
    status === "error"
      ? "bg-destructive/10 text-destructive"
      : status === "pending"
        ? "bg-secondary text-secondary-foreground"
        : "bg-emerald-500/10 text-emerald-600";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
        badgeClassName,
        className,
      )}
    >
      <span
        className="mr-1.5 inline-flex h-2 w-2 rounded-full bg-current"
        aria-hidden="true"
      />
      {label}
      {status === "error" && error instanceof Error ? (
        <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">
          ({error.message})
        </span>
      ) : null}
    </span>
  );
}

function ScorePlaceholder({
  channelId,
  contentTypeFilter,
}: {
  channelId: string | null;
  contentTypeFilter: ContentTypeFilter;
}) {
  const growthScoreQuery = useQuery({
    ...growthQueries.score(
      channelId,
      contentTypeFilter === "all" ? null : contentTypeFilter,
    ),
    enabled: Boolean(channelId),
  });

  const errorMessage = growthScoreQuery.isError
    ? growthScoreQuery.error instanceof Error
      ? growthScoreQuery.error.message
      : "We couldn't calculate your growth score."
    : null;

  return (
    <ScoreOverviewCard
      healthBadge={<HealthBadge className="sm:mt-1" />}
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

  // Determine videoType filter for API calls: null if "all", otherwise the type
  const videoTypeFilter = useMemo<"short" | "video" | null>(() => {
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
      }));

      // Filter YouTube videos by selected content type
      const filteredVideoItems = videoItems.filter((item) => {
        if (!item.videoType) return true; // Include items without videoType
        if (item.videoType === "live") return true; // Always include live videos
        if (contentTypeFilter === "all") return true; // Include all when "all" is selected
        return item.videoType === contentTypeFilter;
      });

      baseItems.push(...filteredVideoItems);
    }

    // Sort by date (newest first) and limit to 50
    return baseItems
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 50);
  }, [storedActivityItems, youtubeState.youtubeFeed, contentTypeFilter]);

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
    if (trimmedTitle.length === 0 || trimmedSummary.length === 0) {
      setDraftError("Add a title and entry before saving.");
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
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
        <ScorePlaceholder
          channelId={youtubeState.channelId}
          contentTypeFilter={contentTypeFilter}
        />

        <ContentTypeTabs
          value={contentTypeFilter}
          onChange={setContentTypeFilter}
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
      </main>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/" element={<DashboardShell />} />
          <Route path="/auth/callback" element={<YoutubeAuthCallback />} />
        </Routes>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export default App;
