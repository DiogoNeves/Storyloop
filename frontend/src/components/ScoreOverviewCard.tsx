import { type ReactNode } from "react";
import {
  Area,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  GrowthScoreComponent,
  GrowthScoreResponse,
} from "@/api/growth";
import { cn } from "@/lib/utils";

export interface ScoreTrendDatum {
  week: string;
  score: number;
  ctr: number;
  retention: number;
}

interface ScoreTooltipPayload {
  payload?: ScoreTrendDatum;
}

const scoreTrendData: ScoreTrendDatum[] = [
  { week: "Nov 18", score: 68, ctr: 3.8, retention: 52 },
  { week: "Nov 25", score: 71, ctr: 4.2, retention: 55 },
  { week: "Dec 02", score: 74, ctr: 4.5, retention: 58 },
  { week: "Dec 09", score: 78, ctr: 4.9, retention: 61 },
  { week: "Dec 16", score: 81, ctr: 5.1, retention: 63 },
  { week: "Dec 23", score: 84, ctr: 5.4, retention: 65 },
  { week: "Dec 30", score: 86, ctr: 5.6, retention: 67 },
];

interface ScoreComponentSummary {
  id: "discovery" | "retention" | "loyalty";
  label: string;
  score: number | null;
  weight: number;
}

function formatUpdatedLabel(updatedAt: string | null, isLoading: boolean): string {
  if (isLoading) {
    return "Calculating score…";
  }
  if (!updatedAt) {
    return "Updated just now";
  }
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) {
    return "Updated recently";
  }
  const elapsedMs = Date.now() - parsed.getTime();
  if (elapsedMs <= 0) {
    return "Updated just now";
  }
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 1) {
    return "Updated just now";
  }
  if (elapsedMinutes < 60) {
    return `Updated ${elapsedMinutes}m ago`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `Updated ${elapsedHours}h ago`;
  }
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `Updated ${elapsedDays}d ago`;
}

function ScoreTooltipContent({
  active,
  payload,
  label,
}: TooltipProps<number, string>) {
  if (!active || !Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  const firstPoint = payload[0];

  if (
    typeof firstPoint !== "object" ||
    firstPoint === null ||
    !("payload" in firstPoint)
  ) {
    return null;
  }

  const point = (firstPoint as ScoreTooltipPayload).payload;

  if (!point) {
    return null;
  }

  const tooltipLabel =
    typeof label === "number" ? label.toString() : label ?? "";

  return (
    <div className="w-48 rounded-xl border border-border/80 bg-popover/95 px-4 py-3 text-sm shadow-lg backdrop-blur">
      <div className="font-medium text-foreground">{tooltipLabel}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-semibold text-primary">{point.score} pts</span>
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          score
        </span>
      </div>
      <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>CTR</span>
          <span className="font-medium text-foreground">{point.ctr}%</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Avg retention</span>
          <span className="font-medium text-foreground">{point.retention}%</span>
        </div>
      </div>
    </div>
  );
}

interface ScoreHeadlineProps {
  currentScore: number | null;
  change: number | null;
  updatedLabel: string;
  isLoading: boolean;
  components: ScoreComponentSummary[];
}

function ScoreHeadline({
  currentScore,
  change,
  updatedLabel,
  isLoading,
  components,
}: ScoreHeadlineProps) {
  const hasScore = typeof currentScore === "number" && Number.isFinite(currentScore);
  const hasChange = typeof change === "number" && Number.isFinite(change);
  const changeIsPositive = hasChange ? (change as number) >= 0 : true;

  const scoreDisplay = hasScore ? currentScore!.toFixed(1) : "—";
  const changeDisplay = hasChange
    ? `${changeIsPositive ? "▲" : "▼"}${Math.abs(change as number).toFixed(1)} pts`
    : "—";

  const changeClassName = hasChange
    ? changeIsPositive
      ? "bg-emerald-500/10 text-emerald-600"
      : "bg-destructive/10 text-destructive"
    : "bg-muted text-muted-foreground";

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
          <span
            className={cn(
              "flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
              changeClassName,
            )}
          >
            {changeDisplay}
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
      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />
          <span>Score trend</span>
        </div>
        <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          {updatedLabel}
        </span>
      </div>
    </div>
  );
}

interface ScoreTrendChartProps {
  data: ScoreTrendDatum[];
}

function ScoreTrendChart({ data }: ScoreTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 16, right: 24, bottom: 12, left: 0 }}>
        <defs>
          <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid
          stroke="hsl(var(--border))"
          strokeDasharray="4 6"
          strokeOpacity={0.3}
          vertical={false}
        />
        <XAxis
          dataKey="week"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
        />
        <YAxis hide domain={["dataMin - 6", "dataMax + 6"]} />
        <Tooltip
          cursor={{
            stroke: "hsl(var(--primary))",
            strokeWidth: 1,
            strokeDasharray: "4 4",
          }}
          content={<ScoreTooltipContent />}
        />
        <Area
          type="monotone"
          dataKey="score"
          stroke="none"
          fill="url(#scoreGradient)"
          fillOpacity={1}
        />
        <Line
          type="monotone"
          dataKey="score"
          stroke="hsl(var(--primary))"
          strokeWidth={2.4}
          dot={{
            r: 4,
            strokeWidth: 2,
            fill: "hsl(var(--primary))",
            stroke: "hsl(var(--background))",
          }}
          activeDot={{ r: 6, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface ScoreOverviewCardProps {
  healthBadge?: ReactNode;
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
  healthBadge,
  score,
  isLoading = false,
  error,
}: ScoreOverviewCardProps) {
  const currentScore = score?.totalScore ?? null;
  const change = score?.scoreDelta ?? null;
  const updatedLabel = formatUpdatedLabel(score?.updatedAt ?? null, isLoading);
  const components = buildComponentSummaries(score);
  const showError = Boolean(error);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-lg">Storyloop Score</CardTitle>
          <CardDescription>
            Storyloop Growth Index combining discovery momentum, retention quality,
            and subscriber loyalty.
          </CardDescription>
        </div>
        {healthBadge}
      </CardHeader>
      <CardContent>
        {showError ? (
          <p className="mb-4 text-sm text-destructive" role="status">
            {error}
          </p>
        ) : null}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,260px)_1fr]">
          <ScoreHeadline
            currentScore={currentScore}
            change={change}
            updatedLabel={updatedLabel}
            isLoading={isLoading}
            components={components}
          />
          <div className="h-72 rounded-2xl border border-border/60 bg-background/40 p-4">
            <ScoreTrendChart data={scoreTrendData} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
