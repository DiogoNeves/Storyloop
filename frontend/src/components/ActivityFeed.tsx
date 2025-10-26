import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface ActivityItem {
  id: string;
  title: string;
  summary: string;
  date: string;
  category: "video" | "insight" | "journal";
}

interface ActivityFeedProps {
  items: ActivityItem[];
  action?: ReactNode;
}
export function ActivityFeed({ items, action }: ActivityFeedProps) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-lg">Recent activity</CardTitle>
          <CardDescription>
            A combined stream of publishing milestones, insights, and journal
            reflections.
          </CardDescription>
        </div>
        {action ? (
          <div className="self-start sm:ml-auto sm:self-end">{action}</div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item) => (
          <ActivityFeedItem key={item.id} item={item} />
        ))}
      </CardContent>
    </Card>
  );
}

function ActivityFeedItem({ item }: { item: ActivityItem }) {
  const formattedDate = new Date(item.date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <Badge
            variant="secondary"
            className={categoryBadgeClass[item.category]}
          >
            {item.category}
          </Badge>
          <time className="text-xs text-muted-foreground" dateTime={item.date}>
            {formattedDate}
          </time>
        </div>
        <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
        <p className="text-sm text-muted-foreground">{item.summary}</p>
      </CardContent>
    </Card>
  );
}

const categoryBadgeClass: Record<ActivityItem["category"], string> = {
  video: "bg-accent text-accent-foreground",
  insight: "",
  journal: "bg-primary/10 text-primary",
};
