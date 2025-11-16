import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import type { GrowthScoreResponse } from "@/api/growth";
import { cn } from "@/lib/utils";

interface JournalSummaryCardsProps {
  score: GrowthScoreResponse | null;
  isLoading?: boolean;
  error?: string | null;
}

function SummaryCard({
  title,
  children,
  to,
  variant = "solid",
}: {
  title: string;
  children: ReactNode;
  to: string;
  variant?: "solid" | "muted";
}) {
  return (
    <Link
      to={to}
      className={cn(
        "group block h-full rounded-xl border p-4 shadow-sm transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        variant === "solid"
          ? "border-border/70 bg-card hover:-translate-y-0.5 hover:shadow-md"
          : "border-dashed border-border/70 bg-muted/40 hover:border-border hover:-translate-y-0.5",
      )}
    >
      <div className="flex h-full flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {children}
      </div>
    </Link>
  );
}

export function JournalSummaryCards({
  score,
  isLoading = false,
  error,
}: JournalSummaryCardsProps) {
  const hasScore = typeof score?.totalScore === "number";
  const scoreDisplay = hasScore && Number.isFinite(score?.totalScore)
    ? score?.totalScore.toFixed(1)
    : "—";

  return (
    <div className="space-y-3">
      {error ? (
        <p className="text-sm text-destructive" role="status">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard title="Storyloop Score" to="/insights">
          <div className="flex flex-1 flex-col justify-between gap-1">
            <div className="text-4xl font-semibold text-foreground">
              {isLoading ? <span className="text-muted-foreground">—</span> : scoreDisplay}
            </div>
            <p className="text-sm text-muted-foreground">
              Momentum across discovery, retention, loyalty
            </p>
          </div>
        </SummaryCard>

        <SummaryCard title="Key Insight" to="/insights">
          <div className="relative flex flex-1 flex-col justify-between gap-1">
            <div
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/70 backdrop-blur-sm"
              role="status"
              aria-label="Key insights coming soon"
            >
              <span className="rounded-md bg-background/80 px-3 py-1 text-sm font-semibold text-muted-foreground">
                Coming Soon
              </span>
            </div>

            <div className="space-y-1 opacity-30" aria-hidden="true">
              <div className="text-2xl font-semibold text-foreground">92% held vs 78% median</div>
              <p className="text-sm text-muted-foreground">Top retention clip this period</p>
            </div>
          </div>
        </SummaryCard>

        <SummaryCard title="See all Insights" to="/insights" variant="muted">
          <p className="text-sm text-muted-foreground">
            Open full analytics and trends
          </p>
        </SummaryCard>
      </div>
    </div>
  );
}

