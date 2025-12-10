import type { ReactNode } from "react";
import { Eye, Heart, MessageCircle } from "lucide-react";

import type { YoutubeVideoStatistics } from "@/api/youtube";
import { cn } from "@/lib/utils";

interface VideoStatCardsProps {
  statistics: YoutubeVideoStatistics | null | undefined;
  isLoading?: boolean;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toLocaleString();
}

function StatCard({
  icon,
  label,
  value,
  isLoading = false,
  className,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  isLoading?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border border-border/70 bg-card p-4 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="text-2xl font-semibold text-foreground">
        {isLoading ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

export function VideoStatCards({
  statistics,
  isLoading = false,
}: VideoStatCardsProps) {
  const hasStats = statistics !== null && statistics !== undefined;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard
        icon={<Eye className="h-4 w-4" />}
        label="Views"
        value={hasStats ? formatNumber(statistics.viewCount) : "—"}
        isLoading={isLoading}
      />
      <StatCard
        icon={<Heart className="h-4 w-4" />}
        label="Likes"
        value={hasStats ? formatNumber(statistics.likeCount) : "—"}
        isLoading={isLoading}
      />
      <StatCard
        icon={<MessageCircle className="h-4 w-4" />}
        label="Comments"
        value={hasStats ? formatNumber(statistics.commentCount) : "—"}
        isLoading={isLoading}
      />
    </div>
  );
}
