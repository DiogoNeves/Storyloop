import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { ActivityFeed, type ActivityItem } from "@/components/ActivityFeed";
import { NavBar } from "@/components/NavBar";
import { fetchHealth } from "@/lib/api";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      staleTime: 60_000,
    },
  },
});

function HealthBadge() {
  const { data, status, error } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
  });

  const label =
    status === "pending"
      ? "Checking backend…"
      : status === "error"
      ? "API offline"
      : data?.status ?? "API ready";

  const badgeClassName =
    status === "error"
      ? "bg-destructive/10 text-destructive"
      : status === "pending"
      ? "bg-secondary text-secondary-foreground"
      : "bg-emerald-500/10 text-emerald-600";

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${badgeClassName}`}>
      <span className="mr-1.5 inline-flex h-2 w-2 rounded-full bg-current" aria-hidden="true" />
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
    <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Storyloop Score</h2>
          <p className="text-sm text-muted-foreground">
            Line chart placeholder representing CTR × (Avg View Duration ÷ Video Length).
          </p>
        </div>
        <HealthBadge />
      </div>
      <div className="relative h-60 overflow-hidden rounded-lg border border-dashed border-primary/40 bg-gradient-to-br from-primary/10 via-transparent to-primary/5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,_rgba(255,_255,_255,_0.1)_1px,_transparent_0)] [background-size:16px_16px]" />
        <div className="absolute inset-x-0 bottom-0 flex h-full items-center justify-center px-6 text-center text-sm text-primary">
          <span className="rounded-full border border-primary/40 bg-background/70 px-3 py-1 shadow-sm">
            Analytics visualization coming soon
          </span>
        </div>
      </div>
    </section>
  );
}

function WeeklyPrompt() {
  return (
    <section className="rounded-xl border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Weekly reflection prompt</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        What resonated with your audience this week? Capture one storytelling win and one improvement
        opportunity while it&apos;s fresh.
      </p>
      <button
        type="button"
        className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition hover:bg-primary/90"
      >
        Start entry
      </button>
    </section>
  );
}

function DashboardShell() {
  const activityItems = useMemo<ActivityItem[]>(
    () => [
      {
        id: "1",
        title: "Uploaded 'Behind the Scenes at Edit Bay'",
        summary: "View duration lifted to 64%. Keep leaning into granular storytelling beats.",
        date: new Date().toISOString(),
        category: "video",
      },
      {
        id: "2",
        title: "Growth insight: Hook iteration working",
        summary: "CTR climbed 14% week over week after testing the narrative teaser hook.",
        date: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
        category: "insight",
      },
      {
        id: "3",
        title: "Weekly journal draft",
        summary: "Reflect on the edit pace experimentation and the impact on watch curve retention.",
        date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        category: "journal",
      },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-muted/20 text-foreground">
      <NavBar />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
        <section className="rounded-xl border bg-card p-8 shadow-sm">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Storyloop | Content journal
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Track your Growth Score, review publishing milestones, and capture actionable insights
            every week. This placeholder experience validates the full-stack wiring before shipping
            production dashboards.
          </p>
        </section>

        <ScorePlaceholder />

        <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          <ActivityFeed items={activityItems} />
          <WeeklyPrompt />
        </div>
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
