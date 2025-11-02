import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useId, useMemo, useState } from "react";

import { ActivityFeed, type ActivityDraft } from "@/components/ActivityFeed";
import { NavBar } from "@/components/NavBar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  entriesMutations,
  entriesQueries,
  type CreateEntryInput,
  type Entry,
} from "@/api/entries";
import { healthQueries } from "@/api/health";
import { cn } from "@/lib/utils";
import { type ActivityItem, entryToActivityItem } from "@/lib/types/entries";

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

type ScoreTrendPoint = {
  label: string;
  shortLabel: string;
  score: number;
  summary: string;
};

type SupportingMetric = {
  label: string;
  value: string;
  change: string;
  tone: "positive" | "neutral" | "negative";
};

const SCORE_TREND: ScoreTrendPoint[] = [
  {
    label: "Week 1",
    shortLabel: "W1",
    score: 68,
    summary: "Season relaunch baseline after the onboarding series.",
  },
  {
    label: "Week 2",
    shortLabel: "W2",
    score: 72,
    summary: "CTR ticked up once the teaser thumbnail test landed.",
  },
  {
    label: "Week 3",
    shortLabel: "W3",
    score: 75,
    summary: "Retention held steady with the pacing experiment.",
  },
  {
    label: "Week 4",
    shortLabel: "W4",
    score: 74,
    summary: "Minor dip after skipping the mid-week post.",
  },
  {
    label: "Week 5",
    shortLabel: "W5",
    score: 78,
    summary: "Recap video lifted completion for new visitors.",
  },
  {
    label: "Week 6",
    shortLabel: "W6",
    score: 83,
    summary: "The narrative hook refresh increased time watched.",
  },
  {
    label: "Week 7",
    shortLabel: "W7",
    score: 87,
    summary: "Momentum continued with the behind-the-scenes drop.",
  },
  {
    label: "Week 8",
    shortLabel: "W8",
    score: 90,
    summary: "Collab premiere drew returning subscribers back in.",
  },
  {
    label: "Today",
    shortLabel: "Now",
    score: 94,
    summary: "Highlight edit shipped; returning viewers spiked again.",
  },
];

const SUPPORTING_METRICS: SupportingMetric[] = [
  {
    label: "Click-through rate",
    value: "6.8%",
    change: "▲ 0.9%",
    tone: "positive",
  },
  {
    label: "Avg view duration",
    value: "5m 12s",
    change: "▲ 18s",
    tone: "positive",
  },
  {
    label: "Video length",
    value: "12m 40s",
    change: "Weekly average",
    tone: "neutral",
  },
  {
    label: "Uploads",
    value: "3",
    change: "Last 14 days",
    tone: "neutral",
  },
];

const MOMENTUM_FACTS = [
  { title: "Last 90 days", detail: "Momentum building" },
  { title: "Peak", detail: "Week 8 · 94 pts" },
  { title: "Next update", detail: "New upload scheduled tomorrow" },
];

function getMetricToneClasses(tone: SupportingMetric["tone"]) {
  if (tone === "positive") {
    return "text-emerald-600";
  }
  if (tone === "negative") {
    return "text-destructive";
  }
  return "text-muted-foreground";
}

function formatChangeBadge(change: number | null, comparisonLabel: string) {
  if (change === null) {
    return {
      label: "Baseline week",
      className: "bg-muted text-muted-foreground",
    };
  }

  if (change > 0) {
    return {
      label: `+${change.toFixed(1)} pts vs ${comparisonLabel}`,
      className: "bg-emerald-500/15 text-emerald-600",
    };
  }

  if (change < 0) {
    return {
      label: `${change.toFixed(1)} pts vs ${comparisonLabel}`,
      className: "bg-destructive/10 text-destructive",
    };
  }

  return {
    label: `No change vs ${comparisonLabel}`,
    className: "bg-muted text-muted-foreground",
  };
}

function ScoreTrendChart({
  data,
  activeIndex,
  onActiveIndexChange,
  onResetActiveIndex,
}: {
  data: ScoreTrendPoint[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onResetActiveIndex: () => void;
}) {
  const chartHeight = 220;
  const chartWidth = 520;
  const gradientId = useId();

  const { coordinates, linePath, areaPath, domainMin, domainMax } = useMemo(() => {
    const values = data.map((point) => point.score);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const padding = Math.max(4, (maxValue - minValue) * 0.12);
    const domainMinValue = Math.max(0, minValue - padding);
    const domainMaxValue = maxValue + padding;

    const verticalRange = domainMaxValue - domainMinValue || 1;

    const mappedCoordinates = data.map((point, index) => {
      const x = (index / Math.max(1, data.length - 1)) * chartWidth;
      const y =
        chartHeight - ((point.score - domainMinValue) / verticalRange) * chartHeight;
      return { x, y };
    });

    const mappedLinePath = mappedCoordinates
      .map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
      .join(" ");

    const mappedAreaPath = [
      `M0 ${chartHeight.toFixed(2)}`,
      ...mappedCoordinates.map(
        ({ x, y }) => `L${x.toFixed(2)} ${y.toFixed(2)}`,
      ),
      `L${chartWidth.toFixed(2)} ${chartHeight.toFixed(2)}`,
      "Z",
    ].join(" ");

    return {
      coordinates: mappedCoordinates,
      linePath: mappedLinePath,
      areaPath: mappedAreaPath,
      domainMin: domainMinValue,
      domainMax: domainMaxValue,
    };
  }, [chartHeight, chartWidth, data]);

  const latestIndex = data.length - 1;
  const activeCoordinate = coordinates[activeIndex] ?? coordinates[latestIndex];

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const pointerX = event.clientX - bounds.left;
      const width = bounds.width || 1;
      const ratio = Math.min(Math.max(pointerX / width, 0), 1);
      const nextIndex = Math.round(ratio * latestIndex);
      onActiveIndexChange(nextIndex);
    },
    [latestIndex, onActiveIndexChange],
  );

  const handlePointerLeave = useCallback(() => {
    onResetActiveIndex();
  }, [onResetActiveIndex]);

  const gridLines = 4;

  return (
    <div className="w-full">
      <div
        className="relative h-64 w-full overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/5 via-background to-background p-6 shadow-sm"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerUp={handlePointerLeave}
        role="presentation"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.25),_transparent_55%)]"
          aria-hidden="true"
        />
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="h-full w-full"
          role="img"
          aria-label="Storyloop score trend"
        >
          <defs>
            <linearGradient id={`${gradientId}-area`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${gradientId}-line`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="hsl(var(--chart-2))" />
              <stop offset="100%" stopColor="hsl(var(--primary))" />
            </linearGradient>
          </defs>
          {Array.from({ length: gridLines }).map((_, index) => {
            const y = ((index + 1) / (gridLines + 1)) * chartHeight;
            return (
              <line
                key={`grid-${index}`}
                x1="0"
                x2={chartWidth}
                y1={y}
                y2={y}
                stroke="hsl(var(--muted-foreground) / 0.14)"
                strokeDasharray="6 8"
              />
            );
          })}
          <path d={areaPath} fill={`url(#${gradientId}-area)`} />
          <path
            d={linePath}
            fill="none"
            stroke={`url(#${gradientId}-line)`}
            strokeWidth="6"
            strokeLinecap="round"
          />
          {activeCoordinate ? (
            <g aria-hidden="true">
              <line
                x1={activeCoordinate.x}
                x2={activeCoordinate.x}
                y1={0}
                y2={chartHeight}
                stroke="hsl(var(--primary) / 0.3)"
                strokeDasharray="4 8"
              />
              <circle
                cx={activeCoordinate.x}
                cy={activeCoordinate.y}
                r={8}
                fill="hsl(var(--background))"
                stroke="hsl(var(--primary))"
                strokeWidth="3"
              />
            </g>
          ) : null}
        </svg>
        {activeCoordinate ? (
          <div
            className="pointer-events-none absolute rounded-lg border border-border/80 bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
            style={{
              left: `min(calc(${(activeCoordinate.x / chartWidth) * 100}% + 16px), calc(100% - 8rem))`,
              top: `calc(${(activeCoordinate.y / chartHeight) * 100}% - 2.75rem)`,
            }}
          >
            <p className="font-medium text-muted-foreground">{data[activeIndex]?.label}</p>
            <p className="text-sm font-semibold text-foreground">
              {Math.round(data[activeIndex]?.score ?? 0)} pts
            </p>
          </div>
        ) : null}
        <div className="pointer-events-none absolute inset-x-6 bottom-6 flex justify-between text-[0.625rem] uppercase tracking-wide text-muted-foreground">
          <span>{Math.round(domainMin)} pts</span>
          <span>{Math.round(domainMax)} pts</span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-9 gap-2 text-xs text-muted-foreground">
        {data.map((point, index) => (
          <div
            key={point.label}
            className={cn(
              "text-center",
              index === activeIndex && "text-foreground font-medium",
            )}
          >
            {point.shortLabel}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreOverviewCard() {
  const latestIndex = SCORE_TREND.length - 1;
  const [activeIndex, setActiveIndex] = useState(latestIndex);

  const activePoint = SCORE_TREND[activeIndex];
  const previousPoint = SCORE_TREND[Math.max(activeIndex - 1, 0)];
  const change =
    activeIndex === 0
      ? null
      : Number((activePoint.score - previousPoint.score).toFixed(1));

  const comparisonLabel =
    activeIndex === 0
      ? ""
      : activeIndex === latestIndex
        ? "last update"
        : SCORE_TREND[activeIndex - 1].label.toLowerCase();

  const { label: changeLabel, className: changeClasses } = formatChangeBadge(
    change,
    comparisonLabel,
  );

  const scoreDescription =
    "Storyloop Score blends CTR × (Avg View Duration ÷ Video Length) to monitor narrative resonance.";

  const handleResetActiveIndex = useCallback(() => {
    setActiveIndex(latestIndex);
  }, [latestIndex]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm uppercase tracking-wide text-muted-foreground">
            <span className="inline-flex h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
            Momentum overview
          </div>
          <div>
            <CardTitle className="text-xl font-semibold">Storyloop Score</CardTitle>
            <CardDescription>{scoreDescription}</CardDescription>
          </div>
        </div>
        <HealthBadge className="self-start sm:self-end" />
      </CardHeader>
      <CardContent>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-center">
          <div className="space-y-6">
            <div>
              <p className="text-sm uppercase tracking-wide text-muted-foreground">
                {activeIndex === latestIndex ? "Current score" : activePoint.label}
              </p>
              <div className="mt-3 flex flex-wrap items-baseline gap-3">
                <span className="text-6xl font-semibold tracking-tight text-foreground">
                  {Math.round(activePoint.score)}
                </span>
                <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-sm font-medium", changeClasses)}>
                  {changeLabel}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{activePoint.summary}</p>
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              {SUPPORTING_METRICS.map((metric) => (
                <div key={metric.label} className="space-y-1">
                  <dt className="uppercase tracking-wide text-muted-foreground">{metric.label}</dt>
                  <dd className="text-base font-medium text-foreground">{metric.value}</dd>
                  <dd className={cn("text-xs", getMetricToneClasses(metric.tone))}>{metric.change}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="space-y-4">
            <ScoreTrendChart
              data={SCORE_TREND}
              activeIndex={activeIndex}
              onActiveIndexChange={setActiveIndex}
              onResetActiveIndex={handleResetActiveIndex}
            />
            <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-3">
              {MOMENTUM_FACTS.map((fact) => (
                <div key={fact.title}>
                  <p className="font-medium text-foreground">{fact.title}</p>
                  <p>{fact.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardShell() {
  const queryClient = useQueryClient();

  const seedItems = useMemo<ActivityItem[]>(
    () => [
      {
        id: "1",
        title: "Uploaded 'Behind the Scenes at Edit Bay'",
        summary:
          "View duration lifted to 64%. Keep leaning into granular storytelling beats.",
        date: new Date().toISOString(),
        category: "video",
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

  const activityItems =
    storedActivityItems.length > 0 ? storedActivityItems : seedItems;

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
        <ScoreOverviewCard />

        <ActivityFeed
          items={activityItems}
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
