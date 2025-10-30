import { type ActivityDraft } from "./ActivityFeed";
import { type ActivityItem } from "@/lib/types/entries";
import { categoryBadgeClass } from "./ActivityFeedItem";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface ActivityDraftCardProps {
  draft: ActivityDraft;
  onChange: (draft: ActivityDraft) => void;
  onCancel?: () => void;
  onSubmit?: () => void;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  submitLabel?: string;
  category?: ActivityItem["category"];
  idPrefix?: string;
  onDelete?: () => void;
  isDeleting?: boolean;
}

export function ActivityDraftCard({
  draft,
  onChange,
  onCancel,
  onSubmit,
  isSubmitting,
  errorMessage,
  submitLabel = "Create entry",
  category = "journal",
  idPrefix = "entry",
  onDelete,
  isDeleting,
}: ActivityDraftCardProps) {
  const isSubmitDisabled =
    draft.title.trim().length === 0 || draft.summary.trim().length === 0;
  const dateInputId = `${idPrefix}-date`;
  const titleInputId = `${idPrefix}-title`;
  const summaryInputId = `${idPrefix}-summary`;
  const videoInputId = `${idPrefix}-video`;

  return (
    <Card className="border-dashed border-primary/40 bg-primary/5">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <Badge variant="secondary" className={categoryBadgeClass[category]}>
            {category}
          </Badge>
          <div className="w-full max-w-[220px] space-y-2 text-left text-xs sm:w-auto">
            <Label
              htmlFor={dateInputId}
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              Date & time
            </Label>
            <Input
              id={dateInputId}
              type="datetime-local"
              value={draft.date}
              onChange={(event) =>
                onChange({ ...draft, date: event.target.value })
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={titleInputId}>Title</Label>
          <Input
            id={titleInputId}
            placeholder="What happened?"
            value={draft.title}
            onChange={(event) =>
              onChange({ ...draft, title: event.target.value })
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={summaryInputId}>Entry</Label>
          <Textarea
            id={summaryInputId}
            placeholder="Capture the beats, insights, or takeaways…"
            value={draft.summary}
            onChange={(event) =>
              onChange({ ...draft, summary: event.target.value })
            }
            rows={6}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={videoInputId}>Linked video ID (optional)</Label>
          <Input
            id={videoInputId}
            placeholder="e.g. abcd1234"
            value={draft.videoId}
            onChange={(event) =>
              onChange({ ...draft, videoId: event.target.value })
            }
          />
          <p className="text-xs text-muted-foreground">
            Paste a YouTube video ID to reference a synced upload.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                void onSubmit?.();
              }}
              disabled={isSubmitDisabled || isSubmitting}
            >
              {isSubmitting ? "Saving…" : submitLabel}
            </Button>
          </div>
          {onDelete ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void onDelete();
              }}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting…" : "Delete entry"}
            </Button>
          ) : null}
        </div>
        {errorMessage ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

