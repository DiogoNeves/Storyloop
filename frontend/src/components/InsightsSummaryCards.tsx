import { Link } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface InsightsSummaryCardsProps {
  score: number | null;
  isLoading?: boolean;
  error?: string | null;
}

interface SummaryCardProps {
  to: string;
  title: string;
  description: string;
  accent?: "default" | "subtle";
  metric?: string;
  caption?: string;
  className?: string;
}

function SummaryCard({
  to,
  title,
  description,
  accent = "default",
  metric,
  caption,
  className,
}: SummaryCardProps) {
  return (
    <Link to={to} className="group block h-full">
      <Card
        className={cn(
          "h-full transition-colors",
          accent === "subtle"
            ? "border-dashed bg-muted/50 hover:border-primary/50"
            : "hover:border-primary/70",
          className,
        )}
      >
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-foreground">
            {title}
          </CardTitle>
          {metric ? (
            <div className="mt-3 text-3xl font-semibold text-foreground">
              {metric}
            </div>
          ) : null}
          {caption ? (
            <p className="mt-2 text-xs text-muted-foreground">{caption}</p>
          ) : null}
        </CardHeader>
        <CardContent>
          <p
            className={cn(
              "text-sm",
              accent === "subtle"
                ? "text-muted-foreground"
                : "text-muted-foreground",
            )}
          >
            {description}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

export function InsightsSummaryCards({
  score,
  isLoading = false,
  error,
}: InsightsSummaryCardsProps) {
  const scoreDisplay =
    typeof score === "number" && Number.isFinite(score)
      ? score.toFixed(1)
      : "—";

  const keyInsightMetric = "92% held vs 78% median";

  return (
    <div className="space-y-3">
      {error ? (
        <p className="text-sm text-destructive" role="status">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          to="/insights"
          title="Storyloop Score"
          metric={isLoading ? "…" : scoreDisplay}
          caption="Momentum across discovery, retention, loyalty"
          description="View the full score breakdown"
        />
        <SummaryCard
          to="/insights"
          title="Key Insight"
          metric={keyInsightMetric}
          caption="Top retention clip this period"
          description="See why this moment keeps viewers watching"
        />
        <SummaryCard
          to="/insights"
          title="See all Insights"
          description="Open full analytics and trends"
          accent="subtle"
        />
      </div>
    </div>
  );
}
