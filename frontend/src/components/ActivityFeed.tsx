export interface ActivityItem {
  id: string;
  title: string;
  summary: string;
  date: string;
  category: "video" | "insight" | "journal";
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-6 shadow-sm">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Recent activity</h2>
          <p className="text-sm text-muted-foreground">
            A combined stream of publishing milestones, insights, and journal
            reflections.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
        >
          Start entry
        </button>
      </header>
      <div className="space-y-4">
        {items.map((item) => (
          <ActivityFeedItem key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function ActivityFeedItem({ item }: { item: ActivityItem }) {
  const formattedDate = new Date(item.date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <article className="grid gap-2 rounded-lg border border-border/60 bg-card/60 p-4 transition hover:border-border">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${categoryStyles[item.category]}`}
        >
          {item.category}
        </span>
        <time className="text-xs text-muted-foreground" dateTime={item.date}>
          {formattedDate}
        </time>
      </div>
      <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
      <p className="text-sm text-muted-foreground">{item.summary}</p>
    </article>
  );
}

const categoryStyles: Record<ActivityItem["category"], string> = {
  video: "bg-accent text-accent-foreground",
  insight: "bg-secondary text-secondary-foreground",
  journal: "bg-primary/10 text-primary",
};
