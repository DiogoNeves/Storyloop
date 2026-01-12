import { useEffect, useRef } from "react";
import { Bot } from "lucide-react";

import { type ActivityDraft } from "./ActivityFeed";
import { categoryBadgeClass } from "./ActivityFeedItem";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/status-message";
import { Textarea } from "@/components/ui/textarea";

export interface SmartEntryDraftCardProps {
  draft: ActivityDraft;
  onChange: (draft: ActivityDraft) => void;
  onCancel?: () => void;
  onSubmit?: () => void;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  submitLabel?: string;
  idPrefix?: string;
}

export function SmartEntryDraftCard({
  draft,
  onChange,
  onCancel,
  onSubmit,
  isSubmitting,
  errorMessage,
  submitLabel = "Create smart entry",
  idPrefix = "smart-entry",
}: SmartEntryDraftCardProps) {
  const titleInputId = `${idPrefix}-title`;
  const promptBodyId = `${idPrefix}-prompt-body`;
  const promptFormatId = `${idPrefix}-prompt-format`;
  const titleRef = useRef<HTMLInputElement | null>(null);
  const promptBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const hasFocusedRef = useRef(false);

  const trimmedTitle = draft.title.trim();
  const trimmedPromptBody = (draft.promptBody ?? "").trim();
  const isSubmitDisabled = trimmedTitle.length === 0 || trimmedPromptBody.length === 0;

  useEffect(() => {
    if (hasFocusedRef.current) {
      return;
    }
    const target = trimmedTitle.length > 0 ? promptBodyRef.current : titleRef.current;
    target?.focus({ preventScroll: true });
    hasFocusedRef.current = true;
  }, [trimmedTitle]);

  return (
    <Card className="border-dashed border-primary/40 bg-primary/5">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className={categoryBadgeClass.journal}
          >
            <Bot className="h-4 w-4" aria-hidden="true" />
            <span>journal</span>
          </Badge>
          <span className="text-xs text-muted-foreground">
            Smart prompt
          </span>
        </div>

        <div className="space-y-4">
          <FormField id={titleInputId} label="Title" required>
            <Input
              id={titleInputId}
              placeholder="Weekly insight recap"
              value={draft.title}
              ref={titleRef}
              onChange={(event) =>
                onChange({ ...draft, title: event.target.value })
              }
            />
          </FormField>

          <FormField id={promptBodyId} label="What to include" required>
            <Textarea
              id={promptBodyId}
              placeholder="Highlight this week’s wins, blockers, and next experiments..."
              value={draft.promptBody ?? ""}
              ref={promptBodyRef}
              onChange={(event) =>
                onChange({ ...draft, promptBody: event.target.value })
              }
              rows={5}
            />
          </FormField>

          <FormField id={promptFormatId} label="Format (optional)">
            <Textarea
              id={promptFormatId}
              placeholder="Bullet list with headings, then a short summary paragraph."
              value={draft.promptFormat ?? ""}
              onChange={(event) =>
                onChange({ ...draft, promptFormat: event.target.value })
              }
              rows={3}
            />
          </FormField>
        </div>

        <div className="flex flex-row justify-between gap-2 sm:items-center">
          <div className="flex flex-row gap-2 sm:justify-end">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" disabled={isSubmitDisabled || isSubmitting} onClick={onSubmit}>
              {isSubmitting ? "Saving…" : submitLabel}
            </Button>
          </div>
        </div>
        <StatusMessage type="error" message={errorMessage} />
      </CardContent>
    </Card>
  );
}
