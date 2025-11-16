import { useQuery } from "@tanstack/react-query";

import { growthQueries } from "@/api/growth";
import { NavBar } from "@/components/NavBar";
import { InsightsCard } from "@/components/InsightsCard";
import { ScoreHeadline, buildComponentSummaries } from "@/components/ScoreOverviewCard";

export function InsightsPage() {
  const growthScoreQuery = useQuery({ ...growthQueries.score(null) });

  const errorMessage = growthScoreQuery.isError
    ? growthScoreQuery.error instanceof Error
      ? growthScoreQuery.error.message
      : "We couldn't calculate your growth score."
    : null;

  const components = buildComponentSummaries(growthScoreQuery.data);
  const currentScore = growthScoreQuery.data?.totalScore ?? null;

  return (
    <div className="min-h-screen bg-muted/20 text-foreground">
      <NavBar />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold text-foreground">Insights</h1>
          <p className="text-sm text-muted-foreground">
            Analytics, highlights, and trends from your Storyloop journey.
          </p>
        </div>

        {errorMessage ? (
          <p className="text-sm text-destructive" role="status">
            {errorMessage}
          </p>
        ) : null}

        <section className="space-y-4 rounded-lg border border-border bg-background p-6 shadow-sm">
          <ScoreHeadline
            currentScore={currentScore}
            isLoading={growthScoreQuery.isPending}
            components={components}
          />
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-background p-6 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-foreground">Key Insights</h2>
            <p className="text-sm text-muted-foreground">
              Deep dives into the moments driving audience momentum.
            </p>
          </div>
          <InsightsCard />
        </section>
      </main>
    </div>
  );
}

export default InsightsPage;
