import type {
  GrowthScoreComponent,
  GrowthScoreResponse,
} from "@/api/growth";
import { cn } from "@/lib/utils";
import { InsightsCard } from "@/components/InsightsCard";

interface ScoreComponentSummary {
  id: "discovery" | "retention" | "loyalty";
  label: string;
  score: number | null;
  weight: number;
}

interface ScoreHeadlineProps {
  currentScore: number | null;
  isLoading: boolean;
  components: ScoreComponentSummary[];
}

function ScoreHeadline({
  currentScore,
  isLoading,
  components,
}: ScoreHeadlineProps) {
  const hasScore = typeof currentScore === "number" && Number.isFinite(currentScore);

  const scoreDisplay = hasScore ? currentScore.toFixed(1) : "—";

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-border/70 bg-gradient-to-br from-primary/10 via-background to-background p-6 shadow-inner">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Current score
        </p>
        <div className="mt-4 flex items-baseline gap-4">
          <span
            className={cn(
              "text-5xl font-semibold leading-none tracking-tight",
              isLoading ? "text-muted-foreground/80" : "text-foreground",
            )}
          >
            {scoreDisplay}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Momentum across discovery, retention quality, and loyalty.
        </p>
        {components.length > 0 ? (
          <dl className="mt-5 grid gap-2 text-sm text-muted-foreground">
            {components.map((component) => (
              <div key={component.id} className="flex items-center justify-between">
                <dt>{component.label}</dt>
                <dd className="font-medium text-foreground">
                  {typeof component.score === "number"
                    ? `${component.score.toFixed(1)} pts`
                    : "—"}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </div>
  );
}

interface ScoreOverviewCardProps {
  score?: GrowthScoreResponse | null;
  isLoading?: boolean;
  error?: string | null;
}

function buildComponentSummaries(
  score: GrowthScoreResponse | null | undefined,
): ScoreComponentSummary[] {
  if (!score) {
    return [];
  }

  const { discovery, retention, loyalty } = score.breakdown;
  const toSummary = (
    id: ScoreComponentSummary["id"],
    label: string,
    component: GrowthScoreComponent,
  ): ScoreComponentSummary => ({
    id,
    label: `${label} · ${Math.round(component.weight * 100)}%`,
    score: component.score,
    weight: component.weight,
  });

  return [
    toSummary("discovery", "Discovery", discovery),
    toSummary("retention", "Retention quality", retention),
    toSummary("loyalty", "Loyalty", loyalty),
  ];
}

export function ScoreOverviewCard({
  score,
  isLoading = false,
  error,
}: ScoreOverviewCardProps) {
  const currentScore = score?.totalScore ?? null;
  const components = buildComponentSummaries(score);
  const showError = Boolean(error);

  return (
    <>
      {showError ? (
        <p className="mb-4 text-sm text-destructive" role="status">
          {error}
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <ScoreHeadline
            currentScore={currentScore}
            isLoading={isLoading}
            components={components}
          />
        </div>
        <div className="lg:col-span-2">
          <InsightsCard />
        </div>
      </div>
    </>
  );
}
