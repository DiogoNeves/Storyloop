import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface ActivityItem {
  id: string;
  title: string;
  summary: string;
  date: string;
  category: "video" | "insight" | "journal";
}

export interface ActivityDraft {
  title: string;
  summary: string;
  date: string; // datetime-local string
}

interface ActivityFeedProps {
  items: ActivityItem[];
  draft?: ActivityDraft | null;
  onStartDraft?: () => void;
  onDraftChange?: (draft: ActivityDraft) => void;
  onCancelDraft?: () => void;
  onSubmitDraft?: () => void;
}

export function ActivityFeed({
  items,
  draft,
  onStartDraft,
  onDraftChange,
  onCancelDraft,
  onSubmitDraft,
}: ActivityFeedProps) {
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
        {!draft && (
          <Button
            type="button"
            onClick={onStartDraft}
            className="self-start sm:ml-auto sm:self-end"
          >
            Create entry
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {draft && onDraftChange ? (
          <ActivityDraftCard
            draft={draft}
            onChange={onDraftChange}
            onCancel={onCancelDraft}
            onSubmit={onSubmitDraft}
          />
        ) : null}
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

interface ActivityDraftCardProps {
  draft: ActivityDraft;
  onChange: (draft: ActivityDraft) => void;
  onCancel?: () => void;
  onSubmit?: () => void;
}

function ActivityDraftCard({
  draft,
  onChange,
  onCancel,
  onSubmit,
}: ActivityDraftCardProps) {
  const isSubmitDisabled =
    draft.title.trim().length === 0 || draft.summary.trim().length === 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSubmitDisabled && onSubmit) {
      onSubmit();
    }
  };

  return (
    <Card className="border-dashed border-primary/40 bg-primary/5">
      <CardContent className="space-y-4 p-4">
        <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <Badge variant="secondary" className={categoryBadgeClass.journal}>
            journal
          </Badge>
          <div className="w-full max-w-[220px] space-y-2 text-left text-xs sm:w-auto">
            <Label
              htmlFor="new-entry-date"
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              Date & time
            </Label>
            <Input
              id="new-entry-date"
              type="datetime-local"
              value={draft.date}
              onChange={(event) =>
                onChange({ ...draft, date: event.target.value })
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-entry-title">Title</Label>
          <Input
            id="new-entry-title"
            placeholder="What happened?"
            value={draft.title}
            onChange={(event) =>
              onChange({ ...draft, title: event.target.value })
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-entry-summary">Entry</Label>
          <Textarea
            id="new-entry-summary"
            placeholder="Capture the beats, insights, or takeaways…"
            value={draft.summary}
            onChange={(event) =>
              onChange({ ...draft, summary: event.target.value })
            }
            rows={6}
          />
        </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitDisabled}>
              Create entry
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
