export interface ActivityItem {
  id: string;
  title: string;
  summary: string;
  date: string;
  category: "video" | "insight" | "journal";
}

const categoryStyles: Record<ActivityItem["category"], string> = {
  video: "bg-accent text-accent-foreground",
  insight: "bg-secondary text-secondary-foreground",
  journal: "bg-primary/10 text-primary",
};

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-6 shadow-sm">
      <header>
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <p className="text-sm text-muted-foreground">
          A combined stream of publishing milestones, insights, and journal
          reflections.
        </p>
      </header>
      <div className="space-y-4">
        {items.map((item) => (
          <article
            key={item.id}
            className="grid gap-2 rounded-lg border border-border/60 bg-card/60 p-4 transition hover:border-border"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${categoryStyles[item.category]}`}
              >
                {item.category}
              </span>
              <time className="text-xs text-muted-foreground" dateTime={item.date}>
                {new Date(item.date).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </time>
            </div>
            <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
            <p className="text-sm text-muted-foreground">{item.summary}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
