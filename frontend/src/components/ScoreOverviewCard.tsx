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
  currentScore: number;
  change: number;
  updatedLabel: string;
}

function ScoreHeadline({ currentScore, change, updatedLabel }: ScoreHeadlineProps) {
  const changeIsPositive = change >= 0;

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-border/70 bg-gradient-to-br from-primary/10 via-background to-background p-6 shadow-inner">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Current score
        </p>
        <div className="mt-4 flex items-baseline gap-4">
          <span className="text-5xl font-semibold leading-none tracking-tight text-foreground">
            {currentScore}
          </span>
          <span
            className={cn(
              "flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
              changeIsPositive
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-destructive/10 text-destructive",
            )}
          >
            {changeIsPositive ? "▲" : "▼"}
            {Math.abs(change).toFixed(1)} pts
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Momentum over the past 30 days based on CTR and watch time retention.
        </p>
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
}

export function ScoreOverviewCard({ healthBadge }: ScoreOverviewCardProps) {
  const currentScore = 86;
  const change = 4.2;
  const updatedLabel = "Updated 2h ago";

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-lg">Storyloop Score</CardTitle>
          <CardDescription>
            Line chart placeholder representing CTR × (Avg View Duration ÷ Video Length).
          </CardDescription>
        </div>
        {healthBadge}
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,260px)_1fr]">
          <ScoreHeadline currentScore={currentScore} change={change} updatedLabel={updatedLabel} />
          <div className="h-72 rounded-2xl border border-border/60 bg-background/40 p-4">
            <ScoreTrendChart data={scoreTrendData} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
