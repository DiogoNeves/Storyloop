import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { useMemo } from "react";

import { ActivityFeed, type ActivityItem } from "@/components/ActivityFeed";
import { NavBar } from "@/components/NavBar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { healthQueries } from "@/api/health";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      staleTime: 60_000,
    },
  },
});

function HealthBadge() {
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
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${badgeClassName}`}
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
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="text-lg">Storyloop Score</CardTitle>
          <CardDescription>
            Line chart placeholder representing CTR × (Avg View Duration ÷ Video
            Length).
          </CardDescription>
        </div>
        <HealthBadge />
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
  const activityItems = useMemo<ActivityItem[]>(
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
    []
  );

  return (
    <div className="min-h-screen bg-muted/20 text-foreground">
      <NavBar />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
        <ScorePlaceholder />

        <ActivityFeed items={activityItems} />
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
