import { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import type { GrowthScoreComponent } from "@/api/growth";
import { growthQueries } from "@/api/growth";
import { useYouTubeFeed } from "@/hooks/useYouTubeFeed";
import { cn } from "@/lib/utils";

interface ScoreComponentSummary {
  id: "discovery" | "retention" | "loyalty";
  label: string;
  score: number | null;
  weight: number;
}

function buildComponentSummaries(component: GrowthScoreComponent, label: string) {
  return {
    label,
    score: component.score,
    weight: component.weight,
  };
}

export function InsightsPage() {
  const youtubeState = useYouTubeFeed(null);
  const growthScoreQuery = useQuery({
    ...growthQueries.score(youtubeState.channelId ?? null),
  });

  const scoreErrorMessage = growthScoreQuery.isError
    ? growthScoreQuery.error instanceof Error
      ? growthScoreQuery.error.message
      : "We couldn't calculate your growth score."
    : null;

  const componentSummaries = useMemo<ScoreComponentSummary[]>(() => {
    if (!growthScoreQuery.data) {
      return [];
    }

    const { discovery, retention, loyalty } = growthScoreQuery.data.breakdown;

    return [
      {
        id: "discovery",
        ...buildComponentSummaries(discovery, "Discovery"),
      },
      {
        id: "retention",
        ...buildComponentSummaries(retention, "Retention quality"),
      },
      {
        id: "loyalty",
        ...buildComponentSummaries(loyalty, "Loyalty"),
      },
    ];
  }, [growthScoreQuery.data]);

  const scoreDisplay =
    typeof growthScoreQuery.data?.totalScore === "number" &&
    Number.isFinite(growthScoreQuery.data.totalScore)
      ? growthScoreQuery.data.totalScore.toFixed(1)
      : "—";

  return (
    <div className="flex flex-col gap-10">
      <Link
        to="/"
        className="text-sm font-medium text-primary underline-offset-2 hover:underline"
      >
        ← Back to activity feed
      </Link>

      <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
        <div className="space-y-3">
          <h1 className="text-lg font-semibold text-foreground">Storyloop Score</h1>
          <div className="flex flex-wrap items-baseline gap-3">
            <p className="text-5xl font-semibold text-foreground">{scoreDisplay}</p>
            <p className="text-sm text-muted-foreground">
              Momentum across discovery, retention, loyalty
            </p>
          </div>
          {scoreErrorMessage ? (
            <p className="text-sm text-destructive" role="status">
              {scoreErrorMessage}
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {componentSummaries.map((component) => (
            <div
              key={component.id}
              className="rounded-xl border border-border/70 bg-muted/40 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {component.label}
                </p>
                <span className="text-xs text-muted-foreground">
                  {Math.round(component.weight * 100)}% weight
                </span>
              </div>
              <p className={cn("mt-3 text-3xl font-semibold", !component.score && "text-muted-foreground")}>
                {typeof component.score === "number" && Number.isFinite(component.score)
                  ? component.score.toFixed(1)
                  : "—"}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-background/20 backdrop-blur-sm"
          role="status"
          aria-label="Key insights coming soon"
        >
          <div className="rounded-lg bg-background/80 px-4 py-2 shadow-sm">
            <p className="text-xl font-semibold text-muted-foreground">Coming Soon</p>
          </div>
        </div>

        <div className="space-y-4 opacity-30" aria-hidden="true">
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Key Insights</h2>
            <p className="text-sm text-muted-foreground">
              Key moment in your top retention clip
            </p>
          </div>

          <div className="space-y-3 text-sm text-muted-foreground">
            <p className="text-lg font-semibold text-foreground">92% held vs 78% median</p>
            <p>
              Viewers stay locked in during this moment, with 92% of the audience held compared
              to your channel's 78% median. The pacing and framing keep eyes on the screen right
              through the retention spike.
            </p>
            <p>
              Treat this clip as your benchmark: reuse the intro rhythm and edit cadence in upcoming
              uploads to validate the lift and make the key moment repeatable.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default InsightsPage;
