import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUp,
  Bot,
  ImagePlus,
  Mic,
  RotateCcw,
  Square,
  WifiOff,
} from "lucide-react";

import { entriesQueries } from "@/api/entries";
import { useAgentConversationContext } from "@/context/AgentConversationContext";
import {
  type AgentConversationAdapter,
  type AgentConversationState,
  type AgentFocus,
  type AgentMessageAttachment,
} from "@/lib/types/agent";
import {
  buildEntryReferenceTitleMap,
  extractEntryReferenceTokens,
  resolveEntryReferenceLabel,
} from "@/lib/entry-references";
import { filterActivityItems } from "@/lib/activity-search";
import { findMentionCandidate } from "@/lib/mention-search";
import {
  compareActivityItemsByPinnedDate,
  entryToActivityItem,
  type ActivityItem,
} from "@/lib/types/entries";
import { cn } from "@/lib/utils";
import { useAssetUpload } from "@/hooks/useAssetUpload";
import { useAudioDictation } from "@/hooks/useAudioDictation";
import { useSync } from "@/hooks/useSync";
import { appendTranscribedText } from "@/lib/dictation";
import { AssetAttachmentList } from "@/components/chat/AssetAttachmentList";
import { VoiceWave } from "@/components/ui/voice-wave";

import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { ChatMessage } from "./chat/ChatMessage";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface LoopieConversationContentProps {
  state: AgentConversationState;
  adapter: AgentConversationAdapter;
  focus?: AgentFocus | null;
  className?: string;
  surfaceVariant?: "panel" | "page";
  composerPlaceholder?: string;
  idleHelperText?: string;
  respondingHelperText?: string;
  disabled?: boolean;
}

interface LoopiePanelViewProps {
  state: AgentConversationState;
  adapter: AgentConversationAdapter;
  focus?: AgentFocus | null;
  isDemo?: boolean;
  isInitializing?: boolean;
  variant?: "panel" | "page";
  className?: string;
  showConversationLink?: boolean;
}

interface LoopiePanelProps {
  variant?: "panel" | "page";
  className?: string;
  showConversationLink?: boolean;
}

interface ComposerMentionState {
  query: string;
  startIndex: number;
  endIndex: number;
}

interface InlineReferenceSegmentText {
  type: "text";
  value: string;
}

interface InlineReferenceSegmentReference {
  type: "reference";
  entryId: string;
  label: string;
  marker: string;
  token: string;
  key: string;
}

type InlineReferenceSegment =
  | InlineReferenceSegmentText
  | InlineReferenceSegmentReference;

const REFERENCE_MARKER_START = 0xe000;
const REFERENCE_MARKER_END = 0xf8ff;

function findComposerMentionState(
  value: string,
  cursorPosition: number | null,
): ComposerMentionState | null {
  if (cursorPosition === null) {
    return null;
  }
  const textBeforeCursor = value.slice(0, cursorPosition);
  const candidate = findMentionCandidate(textBeforeCursor);
  if (!candidate) {
    return null;
  }
  return {
    query: candidate.query,
    startIndex: candidate.startIndex,
    endIndex: cursorPosition,
  };
}

function isReferenceMarker(value: string): boolean {
  if (!value) {
    return false;
  }
  const codePoint = value.codePointAt(0);
  if (typeof codePoint !== "number") {
    return false;
  }
  return codePoint >= REFERENCE_MARKER_START && codePoint <= REFERENCE_MARKER_END;
}

export function LoopieConversationContent({
  state,
  adapter,
  focus,
  className,
  surfaceVariant = "panel",
  composerPlaceholder = "Ask about your content, growth, or next video idea…",
  idleHelperText,
  respondingHelperText,
  disabled = false,
}: LoopieConversationContentProps) {
  const [inputValue, setInputValue] = useState("");
  const [attachments, setAttachments] = useState<AgentMessageAttachment[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [mentionState, setMentionState] = useState<ComposerMentionState | null>(
    null,
  );
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [composerScrollOffset, setComposerScrollOffset] = useState({
    top: 0,
    left: 0,
  });
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const referenceMarkerToEntryIdRef = useRef<Map<string, string>>(new Map());
  const nextReferenceMarkerCodeRef = useRef(REFERENCE_MARKER_START);
  const { isOnline } = useSync();
  const entriesListQuery = useMemo(() => entriesQueries.all(), []);
  const entriesQuery = useQuery(entriesListQuery);
  const journalItems = useMemo<ActivityItem[]>(
    () =>
      (entriesQuery.data ?? [])
        .filter((entry) => entry.category === "journal" && !entry.archived)
        .map((entry) => entryToActivityItem(entry))
        .sort(compareActivityItemsByPinnedDate),
    [entriesQuery.data],
  );
  const entryReferenceTitles = useMemo(
    () =>
      buildEntryReferenceTitleMap(
        journalItems.map((item) => ({ id: item.id, title: item.title })),
      ),
    [journalItems],
  );
  const inlineReferenceSegments = useMemo<InlineReferenceSegment[]>(() => {
    const segments: InlineReferenceSegment[] = [];
    let textBuffer = "";
    let index = 0;

    while (index < inputValue.length) {
      const character = inputValue[index] ?? "";
      if (!isReferenceMarker(character)) {
        textBuffer += character;
        index += 1;
        continue;
      }

      const entryId = referenceMarkerToEntryIdRef.current.get(character);
      const closingIndex = inputValue.indexOf(character, index + 1);
      if (!entryId || closingIndex < 0) {
        textBuffer += character;
        index += 1;
        continue;
      }

      if (textBuffer.length > 0) {
        segments.push({
          type: "text",
          value: textBuffer,
        });
        textBuffer = "";
      }

      segments.push({
        type: "reference",
        entryId,
        label: resolveEntryReferenceLabel(entryId, entryReferenceTitles),
        marker: character,
        token: `@entry:${entryId}`,
        key: `${index}-${entryId}`,
      });
      index = closingIndex + 1;
    }

    if (textBuffer.length > 0) {
      segments.push({
        type: "text",
        value: textBuffer,
      });
    }

    return segments;
  }, [entryReferenceTitles, inputValue]);
  const hasInlineReferences = inlineReferenceSegments.some(
    (segment) => segment.type === "reference",
  );
  const mentionSuggestions = useMemo(() => {
    if (!mentionState) {
      return [];
    }
    const normalizedQuery = mentionState.query.trim();
    if (normalizedQuery.length === 0) {
      return journalItems.slice(0, 3);
    }
    return filterActivityItems(journalItems, normalizedQuery).slice(0, 3);
  }, [journalItems, mentionState]);
  const {
    status: dictationStatus,
    inputLevel: dictationInputLevel,
    elapsedSeconds: dictationElapsedSeconds,
    isSupported: isDictationSupported,
    errorMessage: dictationError,
    stopDictation,
    toggleDictation,
    clearError: clearDictationError,
  } = useAudioDictation({
    mode: "loopie",
    onTranscription: (text) => {
      setInputValue((previous) => {
        const nextValue = appendTranscribedText(previous, text);
        updateMentionState(nextValue, nextValue.length);
        return nextValue;
      });
    },
  });

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    if (typeof container.scrollTo === "function") {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [state.messages, state.composer.status]);

  useEffect(() => {
    if (hasInlineReferences) {
      return;
    }
    setComposerScrollOffset({ top: 0, left: 0 });
  }, [hasInlineReferences]);

  const updateMentionState = useCallback(
    (nextValue: string, cursorPosition: number | null) => {
      const nextMentionState = findComposerMentionState(nextValue, cursorPosition);
      setMentionState(nextMentionState);
      if (!nextMentionState) {
        setMentionActiveIndex(0);
        return;
      }
      if (mentionState?.query !== nextMentionState.query) {
        setMentionActiveIndex(0);
      }
    },
    [mentionState?.query],
  );

  const createReferenceMarker = useCallback((entryId: string): string => {
    const usedMarkers = referenceMarkerToEntryIdRef.current;
    let attempts = 0;
    while (attempts <= REFERENCE_MARKER_END - REFERENCE_MARKER_START) {
      const code = nextReferenceMarkerCodeRef.current;
      const marker = String.fromCharCode(code);
      nextReferenceMarkerCodeRef.current =
        code >= REFERENCE_MARKER_END ? REFERENCE_MARKER_START : code + 1;
      attempts += 1;
      if (usedMarkers.has(marker)) {
        continue;
      }
      usedMarkers.set(marker, entryId);
      return marker;
    }

    // Fallback should be effectively unreachable for real-world composer usage.
    const fallbackMarker = String.fromCharCode(REFERENCE_MARKER_START);
    usedMarkers.set(fallbackMarker, entryId);
    return fallbackMarker;
  }, []);

  const pruneReferenceMarkers = useCallback((value: string) => {
    const activeMarkers = new Set<string>();
    for (const character of value) {
      if (isReferenceMarker(character)) {
        activeMarkers.add(character);
      }
    }
    const markerMap = referenceMarkerToEntryIdRef.current;
    [...markerMap.keys()].forEach((marker) => {
      if (!activeMarkers.has(marker)) {
        markerMap.delete(marker);
      }
    });
  }, []);

  const normalizeCanonicalTokensToMarkers = useCallback(
    (value: string, cursorPosition: number | null) => {
      const references = extractEntryReferenceTokens(value);
      if (references.length === 0) {
        pruneReferenceMarkers(value);
        return { value, cursorPosition };
      }

      let nextValue = "";
      let previousEnd = 0;
      let nextCursor = cursorPosition;

      references.forEach((reference) => {
        nextValue += value.slice(previousEnd, reference.start);
        const marker = createReferenceMarker(reference.entryId);
        const label = resolveEntryReferenceLabel(
          reference.entryId,
          entryReferenceTitles,
        );
        const replacement = `${marker} ${label} ${marker}`;
        nextValue += replacement;

        if (nextCursor !== null) {
          if (nextCursor > reference.end) {
            nextCursor += replacement.length - (reference.end - reference.start);
          } else if (nextCursor > reference.start) {
            nextCursor = nextValue.length;
          }
        }

        previousEnd = reference.end;
      });

      nextValue += value.slice(previousEnd);
      pruneReferenceMarkers(nextValue);
      return { value: nextValue, cursorPosition: nextCursor };
    },
    [createReferenceMarker, entryReferenceTitles, pruneReferenceMarkers],
  );

  const decodeMarkersToCanonicalTokens = useCallback((value: string): string => {
    let decoded = "";
    for (let index = 0; index < value.length; ) {
      const character = value[index] ?? "";
      if (isReferenceMarker(character)) {
        const entryId = referenceMarkerToEntryIdRef.current.get(character);
        const closingIndex = value.indexOf(character, index + 1);
        if (entryId && closingIndex >= 0) {
          decoded += `@entry:${entryId}`;
          index = closingIndex + 1;
          continue;
        }
        index += 1;
        continue;
      }
      decoded += character;
      index += 1;
    }
    return decoded;
  }, []);

  const insertMention = useCallback(
    (selection: ActivityItem) => {
      setInputValue((currentValue) => {
        const activeTextarea = textareaRef.current;
        const cursorPosition =
          activeTextarea?.selectionStart ?? currentValue.length;
        const activeMention = findComposerMentionState(currentValue, cursorPosition);
        if (!activeMention) {
          return currentValue;
        }

        const marker = createReferenceMarker(selection.id);
        const label = resolveEntryReferenceLabel(selection.id, entryReferenceTitles);
        const insertion = `${marker} ${label} ${marker} `;
        const nextValue = `${currentValue.slice(0, activeMention.startIndex)}${insertion}${currentValue.slice(activeMention.endIndex)}`;
        const nextCursorPosition = activeMention.startIndex + insertion.length;
        requestAnimationFrame(() => {
          const textarea = textareaRef.current;
          if (!textarea) {
            return;
          }
          textarea.focus();
          textarea.setSelectionRange(nextCursorPosition, nextCursorPosition);
        });
        setMentionState(null);
        setMentionActiveIndex(0);
        return nextValue;
      });
    },
    [createReferenceMarker, entryReferenceTitles],
  );

  const handleSubmit = useCallback(() => {
    if (state.composer.status !== "idle") {
      return;
    }
    const canonicalInput = decodeMarkersToCanonicalTokens(inputValue).trim();
    if (!canonicalInput && attachments.length === 0) {
      return;
    }
    void adapter.sendMessage(canonicalInput, attachments);
    setInputValue("");
    referenceMarkerToEntryIdRef.current.clear();
    nextReferenceMarkerCodeRef.current = REFERENCE_MARKER_START;
    setAttachments([]);
    setMentionState(null);
    setMentionActiveIndex(0);
  }, [adapter, attachments, decodeMarkersToCanonicalTokens, inputValue, state.composer.status]);

  useEffect(() => {
    if (!mentionState || mentionSuggestions.length === 0) {
      setMentionActiveIndex(0);
      return;
    }
    setMentionActiveIndex((current) =>
      Math.min(current, mentionSuggestions.length - 1),
    );
  }, [mentionState, mentionSuggestions.length]);

  const { uploadFiles, isUploading } = useAssetUpload({
    onUploaded: (asset) => {
      setUploadError(null);
      setAttachments((previous) => [
        ...previous,
        {
          id: asset.id,
          url: asset.url,
          filename: asset.filename,
          mimeType: asset.mimeType,
          width: asset.width ?? undefined,
          height: asset.height ?? undefined,
        },
      ]);
    },
    onError: (error) => {
      setUploadError(error.message);
    },
  });
  const acceptTypes =
    "image/*,application/pdf,text/plain,application/x-subrip,text/srt,text/x-subrip,.srt,.txt";

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
  const isTextareaDisabled =
    disabled ||
    state.composer.status === "responding" ||
    dictationStatus === "transcribing";
  const isDictating = dictationStatus === "recording";
  const isTranscribingDictation = dictationStatus === "transcribing";
  const isDictationDisabled =
    (!isDictating && !isDictationSupported) ||
    disabled ||
    isUploading ||
    state.composer.status !== "idle" ||
    isTranscribingDictation;
  const isSendDisabled =
    disabled ||
    state.composer.status !== "idle" ||
    dictationStatus !== "idle" ||
    (inputValue.trim() === "" && attachments.length === 0);
  const showStopButton =
    state.composer.status === "sending" ||
    state.composer.status === "responding";

  const composerLabel =
    state.composer.status === "responding"
      ? "Loopie is thinking"
      : state.composer.status === "sending"
        ? "Sending to Loopie"
        : "Share your next move with Loopie";

  const padding = surfaceVariant === "panel" ? "px-6 py-5" : "p-2 sm:p-4";
  const composerSurface =
    surfaceVariant === "panel"
      ? "bg-background/98 border-t border-border/40"
      : "bg-background/90 border-t border-border/50";
  const helperText =
    state.composer.status === "responding"
      ? (respondingHelperText ?? "Loopie is synthesizing a tailored suggestion")
      : (idleHelperText ?? composerLabel);

  const focusLabel = focus ? focus.category : null;
  const focusTooltip = focus
    ? `${focus.category} · ${focus.title ? String(focus.title) : focus.id}`
    : null;

  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}
    >
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-5 overflow-hidden",
          padding,
        )}
      >
        <div
          ref={scrollContainerRef}
          className="scrollbar-hide min-h-0 flex-1 space-y-5 overflow-y-auto"
        >
          {state.messages.length === 0 ? (
            <p className="text-sm text-muted-foreground/40">
              Loopie here, let&apos;s chat. 😊
            </p>
          ) : null}
          {state.messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              entryReferenceTitles={entryReferenceTitles}
            />
          ))}
          {state.composer.status === "responding" ? (
            <div className="flex items-center gap-2 pl-1 text-xs text-muted-foreground">
              <span className="h-2 w-2 animate-ping rounded-full bg-primary" />
              Loopie is preparing insight…
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "flex-shrink-0 border-border/40",
          composerSurface,
          padding,
        )}
      >
        <div className="space-y-2">
          {state.composer.error ? (
            <p className="text-xs text-destructive">{state.composer.error}</p>
          ) : null}
          {uploadError ? (
            <p className="text-xs text-destructive">{uploadError}</p>
          ) : null}
          {dictationError ? (
            <p className="text-xs text-destructive">{dictationError}</p>
          ) : null}
          {!isOnline && (
            <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
              <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>You're offline. Messages can't be sent right now.</span>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptTypes}
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
          {attachments.length > 0 ? (
            <AssetAttachmentList
              attachments={attachments}
              onRemove={(attachmentId) => {
                setAttachments((previous) =>
                  previous.filter(
                    (attachment) => attachment.id !== attachmentId,
                  ),
                );
              }}
            />
          ) : null}
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                fileInputRef.current?.click();
              }}
              disabled={isTextareaDisabled || isUploading}
              className="gap-2"
            >
              <ImagePlus className="h-4 w-4" />
              Add an Image or a File
            </Button>
            <div className="flex items-center gap-2">
              {isUploading ? <span>Uploading…</span> : null}
              {focusLabel ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-[10px] text-muted-foreground/60">
                      👀 {focusLabel}
                    </span>
                  </TooltipTrigger>
                  {focusTooltip ? (
                    <TooltipContent>{focusTooltip}</TooltipContent>
                  ) : null}
                </Tooltip>
              ) : null}
            </div>
          </div>
          {isDictating ? (
            <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-2">
              <div className="flex items-center gap-3">
                <VoiceWave
                  active={true}
                  inputLevel={dictationInputLevel}
                  className="h-6 flex-1 text-foreground"
                />
                <span className="min-w-[2.75rem] text-xs tabular-nums text-muted-foreground">
                  {formatDuration(dictationElapsedSeconds)}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  onClick={stopDictation}
                  className="h-8 w-8 rounded-full p-0"
                  aria-label="Stop dictation"
                >
                  <Square className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
          {isTranscribingDictation ? (
            <p className="text-xs text-muted-foreground">Transcribing dictation…</p>
          ) : null}
          <div className="relative select-none rounded-2xl border border-border/50 bg-muted/30 shadow-sm focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
            <div className="relative flex items-end">
              {hasInlineReferences ? (
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl px-4 py-3 pr-24 text-sm">
                  <div
                    data-testid="loopie-composer-overlay-content"
                    className="whitespace-pre-wrap break-words leading-5 text-foreground"
                    style={{
                      transform: `translate(${-composerScrollOffset.left}px, ${-composerScrollOffset.top}px)`,
                    }}
                  >
                    {inlineReferenceSegments.map((segment, index) => {
                      if (segment.type === "text") {
                        return (
                          <span key={`text-${index}`}>{segment.value}</span>
                        );
                      }
                      return (
                        <span key={segment.key}>
                          <span className="invisible">{`${segment.marker} `}</span>
                          <span
                            className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium leading-4 text-primary align-[0.08em]"
                            title={segment.token}
                          >
                            {segment.label}
                          </span>
                          <span className="invisible">{` ${segment.marker}`}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <Textarea
                ref={textareaRef}
                id="agent-composer"
                placeholder={composerPlaceholder}
                value={inputValue}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  const normalized = normalizeCanonicalTokensToMarkers(
                    nextValue,
                    event.target.selectionStart,
                  );
                  setInputValue(normalized.value);
                  updateMentionState(
                    normalized.value,
                    normalized.cursorPosition,
                  );
                  if (
                    normalized.cursorPosition !== null &&
                    normalized.cursorPosition !== event.target.selectionStart
                  ) {
                    requestAnimationFrame(() => {
                      const textarea = textareaRef.current;
                      if (!textarea) {
                        return;
                      }
                      textarea.setSelectionRange(
                        normalized.cursorPosition!,
                        normalized.cursorPosition!,
                      );
                    });
                  }
                }}
                onSelect={(event) => {
                  updateMentionState(
                    event.currentTarget.value,
                    event.currentTarget.selectionStart,
                  );
                }}
                onScroll={(event) => {
                  setComposerScrollOffset({
                    top: event.currentTarget.scrollTop,
                    left: event.currentTarget.scrollLeft,
                  });
                }}
                onKeyDown={(event) => {
                  if (mentionState) {
                    if (event.key === "ArrowDown") {
                      if (mentionSuggestions.length > 0) {
                        event.preventDefault();
                        setMentionActiveIndex(
                          (current) => (current + 1) % mentionSuggestions.length,
                        );
                        return;
                      }
                    }

                    if (event.key === "ArrowUp") {
                      if (mentionSuggestions.length > 0) {
                        event.preventDefault();
                        setMentionActiveIndex(
                          (current) =>
                            (current - 1 + mentionSuggestions.length) %
                            mentionSuggestions.length,
                        );
                        return;
                      }
                    }

                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      mentionSuggestions.length > 0
                    ) {
                      event.preventDefault();
                      const selectedSuggestion =
                        mentionSuggestions[mentionActiveIndex] ??
                        mentionSuggestions[0];
                      if (selectedSuggestion) {
                        insertMention(selectedSuggestion);
                      }
                      return;
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      setMentionState(null);
                      setMentionActiveIndex(0);
                      return;
                    }
                  }

                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSubmit();
                  }
                }}
                onPaste={(event) => {
                  if (!event.clipboardData?.files?.length) {
                    return;
                  }
                  event.preventDefault();
                  handleFilesSelected(event.clipboardData.files);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (event.dataTransfer.files.length > 0) {
                    handleFilesSelected(event.dataTransfer.files);
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                disabled={isTextareaDisabled}
                className={cn(
                  "min-h-[104px] resize-none rounded-2xl border-0 bg-transparent px-4 py-3 pr-24 text-sm shadow-none focus-visible:outline-none focus-visible:ring-0",
                  hasInlineReferences && "text-transparent caret-foreground",
                )}
              />
              <div className="absolute bottom-3 right-3 flex select-none items-center gap-2">
                <span className="hidden text-[10px] text-muted-foreground/70 sm:inline">
                  {state.composer.status === "responding"
                    ? "Loopie is thinking"
                    : "Shift + Enter"}
                </span>
                {dictationStatus === "idle" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    onClick={() => {
                      if (isDictationDisabled) {
                        return;
                      }
                      clearDictationError();
                      void toggleDictation();
                    }}
                    disabled={isDictationDisabled}
                    className="relative h-9 w-9 overflow-hidden rounded-full p-0 shadow-lg transition"
                    aria-label="Dictate message"
                    title={
                      !isDictationSupported
                        ? "Dictation is not supported in this browser"
                        : undefined
                    }
                  >
                    <Mic className="h-4 w-4" />
                  </Button>
                ) : null}
                {showStopButton ? (
                  <Button
                    type="button"
                    onClick={adapter.stopResponse}
                    className="h-9 w-9 rounded-full bg-destructive/90 p-0 text-destructive-foreground shadow-lg transition hover:bg-destructive"
                    aria-label="Stop response"
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSendDisabled}
                    className="h-9 w-9 rounded-full bg-gradient-to-r from-primary via-primary/80 to-primary p-0 text-primary-foreground shadow-lg transition hover:from-primary/90 hover:to-primary/80 disabled:opacity-60"
                    aria-label="Send to Loopie"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            {mentionState ? (
              <div className="absolute inset-x-0 bottom-full z-20 mb-2 px-1">
                <div className="rounded-lg border border-border bg-popover p-2 shadow-lg">
                  {mentionSuggestions.length > 0 ? (
                    <div className="flex flex-col gap-1" role="listbox">
                      {mentionSuggestions.map((item, index) => (
                        <button
                          key={item.id}
                          type="button"
                          className={cn(
                            "flex w-full items-center rounded-md px-2 py-1 text-left text-sm",
                            index === mentionActiveIndex
                              ? "bg-primary/10 text-foreground"
                              : "text-foreground/90 hover:bg-muted/60",
                          )}
                          onMouseDown={(event) => {
                            event.preventDefault();
                          }}
                          onClick={() => {
                            insertMention(item);
                          }}
                        >
                          {item.title}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="px-2 py-1 text-xs text-muted-foreground">
                      {mentionState.query.trim().length === 0
                        ? "No recent journal entries"
                        : "No matches"}
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <p className="text-[10px] text-muted-foreground/70">{helperText}</p>
        </div>
      </div>
    </div>
  );
}

function LoopiePanelView({
  state,
  adapter,
  focus,
  isDemo,
  isInitializing,
  variant = "panel",
  className,
}: LoopiePanelViewProps) {
  const containerClasses = cn(
    "relative flex min-h-0 w-full flex-1 flex-col overflow-hidden",
    variant === "panel"
      ? "h-[calc(100dvh-10rem)] max-h-[calc(100dvh-10rem)] rounded-2xl border border-primary/15 bg-background/98 shadow-[0_24px_70px_-50px_rgba(32,0,77,0.6)]"
      : "h-full rounded-xl border border-border/70 bg-background/95 shadow-sm",
    className,
  );
  const headerPadding = variant === "panel" ? "px-3 py-3" : "px-4 py-4 sm:px-5";

  return (
    <section className={containerClasses}>
      {variant === "panel" ? (
        <div className="from-primary/12 pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b via-primary/5 to-transparent opacity-60" />
      ) : null}
      <div className="relative flex h-full min-h-0 flex-col">
        <header
          className={cn(
            "flex items-start gap-4 border-b",
            variant === "panel"
              ? "border-border/40 backdrop-blur"
              : "border-border/60 bg-background/95",
            headerPadding,
          )}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/15 text-primary">
            <Bot className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="flex flex-1 items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Loopie</h2>
              <p className="text-xs text-muted-foreground/80">
                Keeps notes on your wins and provides guidance.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isDemo ? (
                <span className="rounded-full border border-border/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Demo
                </span>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => adapter.resetConversation()}
                aria-label="Clear conversation"
                title="Clear conversation"
                className="border border-transparent text-muted-foreground transition hover:border-border/40"
                disabled={isInitializing}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>
        <LoopieConversationContent
          state={state}
          adapter={adapter}
          focus={focus}
          surfaceVariant={variant}
          disabled={isInitializing}
        />
      </div>
    </section>
  );
}

export function LoopiePanel({
  variant = "panel",
  className,
}: LoopiePanelProps) {
  const { state, adapter, focus, isDemo, isInitializing } =
    useAgentConversationContext();
  return (
    <LoopiePanelView
      state={state}
      adapter={adapter}
      focus={focus}
      isDemo={isDemo}
      isInitializing={isInitializing}
      variant={variant}
      className={className}
    />
  );
}

function formatDuration(seconds: number): string {
  const normalizedSeconds = Math.max(0, seconds);
  const minutes = Math.floor(normalizedSeconds / 60);
  const remainingSeconds = normalizedSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}
