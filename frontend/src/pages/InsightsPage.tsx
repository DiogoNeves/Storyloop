import { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";

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
      <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
        <div className="space-y-3">
          <h1 className="text-lg font-semibold text-foreground">Storyloop Score</h1>
          <div className="flex flex-wrap items-baseline gap-3">
            <p className="text-5xl font-semibold text-foreground">{scoreDisplay}</p>
            <p className="text-sm text-muted-foreground">
              Momentum across discovery, retention, loyalty
            </p>
          </div>
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

      <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Key Insights</h2>
          <p className="text-sm text-muted-foreground">
            Top retention clip this period
          </p>
        </div>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p className="text-lg font-semibold text-foreground">92% held vs 78% median</p>
          <p>
            This segment maintains exceptional viewer retention, holding 92% of viewers compared
            to your channel's 78% median. The strong narrative hook and visual pacing in this clip
            create compelling momentum that keeps audiences engaged.
          </p>
          <p>
            Use this as a benchmark for upcoming edits: mirror the pacing and framing choices, and
            test similar intro beats in upcoming uploads to validate the lift.
          </p>
        </div>
      </section>
    </div>
  );
}

export default InsightsPage;
