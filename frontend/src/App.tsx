import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import {
  ActivityFeed,
  type ActivityDraft,
  type ActivityItem,
} from "@/components/ActivityFeed";
import { NavBar } from "@/components/NavBar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  createEntry,
  entriesQueries,
  type CreateEntryInput,
  type Entry,
} from "@/api/entries";
import { healthQueries } from "@/api/health";
import { cn } from "@/lib/utils";

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

function ScorePlaceholder() {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-lg">Storyloop Score</CardTitle>
          <CardDescription>
            Line chart placeholder representing CTR × (Avg View Duration ÷ Video
            Length).
          </CardDescription>
        </div>
        <HealthBadge className="self-end" />
      </CardHeader>
      <CardContent>
        <div className="relative h-60 overflow-hidden rounded-lg border border-dashed border-primary/40 bg-gradient-to-br from-primary/10 via-transparent to-primary/5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,_rgba(255,_255,_255,_0.1)_1px,_transparent_0)] [background-size:16px_16px]" />
          <div className="absolute inset-x-0 bottom-0 flex h-full items-center justify-center px-6 text-center text-sm text-primary">
            <span className="rounded-full border border-primary/40 bg-background/70 px-3 py-1 shadow-sm">
              Analytics visualization coming soon
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardShell() {
  const queryClient = useQueryClient();

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
    return storedEntries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      summary: entry.summary,
      date: entry.date,
      category: entry.category,
      linkUrl: entry.linkUrl ?? undefined,
      thumbnailUrl: entry.thumbnailUrl ?? undefined,
    }));
  }, [storedEntries]);

  const activityItems = storedActivityItems;

  const isLoadingActivityItems = entriesStatus === "pending";

  const [draft, setDraft] = useState<ActivityDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  const { mutateAsync: saveEntry, isPending: isSavingEntry } = useMutation({
    mutationFn: createEntry,
    onSuccess: (savedEntry) => {
      if (!savedEntry) {
        return;
      }
      queryClient.setQueryData<Entry[]>(entriesListQuery.queryKey, (current) => {
        const next = (current ?? []).filter((entry) => entry.id !== savedEntry.id);
        next.push(savedEntry);
        next.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        return next;
      });
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
    if (trimmedTitle.length === 0 || trimmedSummary.length === 0) {
      setDraftError("Add a title and entry before saving.");
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
    <div className="min-h-screen bg-muted/20 text-foreground">
      <NavBar />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
        <ScorePlaceholder />

        <ActivityFeed
          items={activityItems}
          isLoadingEntries={isLoadingActivityItems}
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
    <QueryClientProvider client={queryClient}>
      <DashboardShell />
    </QueryClientProvider>
  );
}

export default App;
