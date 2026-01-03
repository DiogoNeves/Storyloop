import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";

import { type ActivityDraft } from "./ActivityFeed";
import { type ActivityItem } from "@/lib/types/entries";
import { categoryBadgeClass } from "./ActivityFeedItem";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAssetUpload } from "@/hooks/useAssetUpload";
import { appendDictationText, useDictation } from "@/hooks/useDictation";

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
  const isSubmitDisabled = draft.title.trim().length === 0;
  const dateInputId = `${idPrefix}-date`;
  const titleInputId = `${idPrefix}-title`;
  const summaryInputId = `${idPrefix}-summary`;
  const formRef = useRef<HTMLFormElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const summaryRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hasFocusedRef = useRef(false);
  const initialTitleRef = useRef<string | undefined>(undefined);
  const lastGeneratedTitleRef = useRef<string | null>(null);
  const draftRef = useRef(draft);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    // Capture the initial title on first render
    if (initialTitleRef.current === undefined) {
      initialTitleRef.current = draft.title;
    }

    // Focus only once when editing starts
    if (hasFocusedRef.current) {
      return;
    }

    // Use the initial title to determine focus target, not the current title
    const isEditingExistingTitle = (initialTitleRef.current ?? "").trim().length > 0;
    const target = isEditingExistingTitle ? summaryRef.current : titleRef.current;
    if (target) {
      target.focus({ preventScroll: true });

      if (isEditingExistingTitle && summaryRef.current) {
        const endPosition = summaryRef.current.value.length;
        summaryRef.current.setSelectionRange(endPosition, endPosition);
        summaryRef.current.scrollTop = summaryRef.current.scrollHeight;
      }

      hasFocusedRef.current = true;
    }
  }, [draft.title]);

  const handleSubmit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (isSubmitDisabled || isSubmitting) {
      return;
    }

    void onSubmit?.();
  };

  const handleShortcutSubmit = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  const handleEscapeToCancel = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel?.();
    }
  };

  const insertSummarySnippet = useCallback(
    (snippet: string) => {
      const textarea = summaryRef.current;
      const current = draft.summary;
      if (!textarea) {
        onChange({ ...draft, summary: `${current}${snippet}` });
        return;
      }

      const start = textarea.selectionStart ?? current.length;
      const end = textarea.selectionEnd ?? start;
      const nextSummary =
        current.slice(0, start) + snippet + current.slice(end);
      onChange({ ...draft, summary: nextSummary });
      requestAnimationFrame(() => {
        textarea.focus();
        const cursor = start + snippet.length;
        textarea.setSelectionRange(cursor, cursor);
      });
    },
    [draft, onChange],
  );

  const { uploadFiles, isUploading } = useAssetUpload({
    onUploaded: (asset) => {
      setUploadError(null);
      const snippet = asset.mimeType.startsWith("image/")
        ? `![${asset.filename}](${asset.url})`
        : `[${asset.filename}](${asset.url})`;
      insertSummarySnippet(snippet);
    },
    onError: (error) => {
      setUploadError(error.message);
    },
  });

  const handleFilesSelected = useCallback(
    (files: FileList | File[]) => {
      if (files.length === 0) {
        return;
      }
      setUploadError(null);
      void uploadFiles(files);
    },
    [uploadFiles],
  );

  const buildSummaryWithDictation = useCallback((snippet: string) => {
    const currentDraft = draftRef.current;
    return appendDictationText(currentDraft.summary, snippet);
  }, []);

  const {
    status: dictationStatus,
    error: dictationError,
    startRecording,
    stopRecording,
    retryTranscription,
    hasRetry,
  } = useDictation({
    onTranscript: (text) => {
      const nextSummary = buildSummaryWithDictation(text);
      onChange({ ...draftRef.current, summary: nextSummary });
    },
    buildTitleInput: (text) => buildSummaryWithDictation(text),
    onTitle: (title) => {
      const currentDraft = draftRef.current;
      const currentTitle = currentDraft.title.trim();
      const shouldUpdateTitle =
        currentTitle.length === 0 ||
        currentTitle === (lastGeneratedTitleRef.current ?? "");
      if (!shouldUpdateTitle) {
        return;
      }
      lastGeneratedTitleRef.current = title;
      onChange({ ...currentDraft, title });
    },
  });

  const isDictationActive = dictationStatus === "recording";
  const isDictationBusy = dictationStatus === "transcribing";
  const isDictationDisabled = isSubmitting || isDictationBusy;

  return (
    <Card className="border-dashed border-primary/40 bg-primary/5">
      <CardContent className="space-y-4 p-4">
        <form
          ref={formRef}
          className="space-y-4"
          onSubmit={(event) => {
            handleSubmit(event);
          }}
          onKeyDown={handleEscapeToCancel}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <Badge
              variant="secondary"
              className={cn(categoryBadgeClass[category], "w-fit")}
            >
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
              ref={titleRef}
              onChange={(event) =>
                onChange({ ...draft, title: event.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor={summaryInputId}>Entry (optional)</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={isDictationActive ? "destructive" : "secondary"}
                  size="sm"
                  onClick={() => {
                    if (isDictationActive) {
                      stopRecording();
                      return;
                    }
                    void startRecording();
                  }}
                  disabled={isDictationDisabled}
                  className="gap-2"
                >
                  {isDictationActive ? (
                    <>
                      <Square className="h-4 w-4" />
                      Stop dictation
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4" />
                      Dictate
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                  disabled={isUploading}
                >
                  {isUploading ? "Uploading…" : "Add image or PDF"}
                </Button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              multiple
              onChange={(event) => {
                if (!event.target.files) {
                  return;
                }
                handleFilesSelected(event.target.files);
                event.target.value = "";
              }}
            />
            <Textarea
              id={summaryInputId}
              placeholder="Capture the beats, insights, or takeaways…"
              value={draft.summary}
              ref={summaryRef}
              onChange={(event) =>
                onChange({ ...draft, summary: event.target.value })
              }
              onKeyDown={handleShortcutSubmit}
              onPaste={(event) => {
                if (!event.clipboardData?.files?.length) {
                  return;
                }
                event.preventDefault();
                handleFilesSelected(event.clipboardData.files);
              }}
              onDrop={(event) => {
                if (!event.dataTransfer.files.length) {
                  return;
                }
                event.preventDefault();
                handleFilesSelected(event.dataTransfer.files);
              }}
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes("Files")) {
                  event.preventDefault();
                }
              }}
              rows={6}
            />
            {uploadError ? (
              <p className="text-xs text-destructive">{uploadError}</p>
            ) : null}
            {dictationStatus === "recording" ? (
              <p className="text-xs text-primary">
                Listening… press stop when you&apos;re done.
              </p>
            ) : null}
            {dictationStatus === "transcribing" ? (
              <p className="text-xs text-muted-foreground">
                Transcribing your dictation…
              </p>
            ) : null}
            {dictationError ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-destructive">
                <span>{dictationError}</span>
                {hasRetry ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void retryTranscription();
                    }}
                  >
                    Retry
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex flex-row justify-between gap-2 sm:items-center">
            <div className="flex flex-row gap-2 sm:justify-end">
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitDisabled || isSubmitting}>
                {isSubmitting ? "Saving…" : submitLabel}
              </Button>
            </div>
            {onDelete ? (
              <Button
                type="button"
                variant="ghost"
                className="text-muted-foreground opacity-60 hover:text-white hover:opacity-100"
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
        </form>
      </CardContent>
    </Card>
  );
}
