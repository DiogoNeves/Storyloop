import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type SyntheticEvent,
  type UIEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, RotateCcw } from "lucide-react";

import { entriesQueries } from "@/api/entries";
import { LoopieComposer } from "@/components/loopie/LoopieComposer";
import { LoopieConversationMessages } from "@/components/loopie/LoopieConversationMessages";
import { computeLoopieComposerUiState } from "@/components/loopie/computeLoopieComposerUiState";
import { Button } from "@/components/ui/button";
import { useAgentConversationContext } from "@/context/AgentConversationContext";
import { useAssetUpload } from "@/hooks/useAssetUpload";
import { useAudioDictation } from "@/hooks/useAudioDictation";
import { useLoopieComposerState } from "@/hooks/useLoopieComposerState";
import { useLoopieReferenceComposer } from "@/hooks/useLoopieReferenceComposer";
import { useSync } from "@/hooks/useSync";
import { appendTranscribedText } from "@/lib/dictation";
import { filterActivityItems } from "@/lib/activity-search";
import { buildEntryReferenceTitleMap } from "@/lib/entry-references";
import {
  compareActivityItemsByPinnedDate,
  entryToActivityItem,
  type ActivityItem,
} from "@/lib/types/entries";
import type {
  AgentConversationAdapter,
  AgentConversationState,
  AgentFocus,
} from "@/lib/types/agent";
import { cn } from "@/lib/utils";

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

const ACCEPT_TYPES =
  "image/*,application/pdf,text/plain,application/x-subrip,text/srt,text/x-subrip,.srt,.txt";

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
  const {
    inputValue,
    attachments,
    uploadError,
    mentionState,
    mentionActiveIndex,
    composerScrollOffset,
    setInputValue,
    addAttachment,
    removeAttachment,
    setUploadError,
    updateMentionState,
    clearMentionState,
    setMentionActiveIndex,
    cycleMentionActiveIndex,
    clampMentionActiveIndex,
    setComposerScrollOffset,
    resetComposerScrollOffset,
    resetAfterSubmit,
  } = useLoopieComposerState();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { isOnline } = useSync();

  const entriesQueryConfig = useMemo(() => entriesQueries.all(), []);
  const entriesQuery = useQuery(entriesQueryConfig);
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

  const {
    inlineReferenceSegments,
    hasInlineReferences,
    normalizeCanonicalTokensToMarkers,
    decodeMarkersToCanonicalTokens,
    createReferenceInsertion,
    resetReferenceMarkers,
  } = useLoopieReferenceComposer({
    inputValue,
    entryReferenceTitles,
  });

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

  const { uploadFiles, isUploading } = useAssetUpload({
    onUploaded: (asset) => {
      setUploadError(null);
      addAttachment({
        id: asset.id,
        url: asset.url,
        filename: asset.filename,
        mimeType: asset.mimeType,
        width: asset.width ?? undefined,
        height: asset.height ?? undefined,
      });
    },
    onError: (error) => {
      setUploadError(error.message);
    },
  });

  const uiState = useMemo(
    () =>
      computeLoopieComposerUiState({
        disabled,
        composer: state.composer,
        dictationStatus,
        isDictationSupported,
        isUploading,
        inputValue,
        attachmentsCount: attachments.length,
        surfaceVariant,
        idleHelperText,
        respondingHelperText,
      }),
    [
      attachments.length,
      dictationStatus,
      disabled,
      idleHelperText,
      inputValue,
      isDictationSupported,
      isUploading,
      respondingHelperText,
      state.composer,
      surfaceVariant,
    ],
  );

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
    resetComposerScrollOffset();
  }, [hasInlineReferences, resetComposerScrollOffset]);

  useEffect(() => {
    if (!mentionState || mentionSuggestions.length === 0) {
      setMentionActiveIndex(0);
      return;
    }

    clampMentionActiveIndex(mentionSuggestions.length);
  }, [
    clampMentionActiveIndex,
    mentionState,
    mentionSuggestions.length,
    setMentionActiveIndex,
  ]);

  const insertMention = useCallback(
    (selection: ActivityItem) => {
      if (!mentionState) {
        return;
      }

      setInputValue((currentValue) => {
        const insertion = createReferenceInsertion(selection.id);
        const nextValue = `${currentValue.slice(0, mentionState.startIndex)}${insertion}${currentValue.slice(mentionState.endIndex)}`;
        const nextCursorPosition = mentionState.startIndex + insertion.length;

        requestAnimationFrame(() => {
          const textarea = textareaRef.current;
          if (!textarea) {
            return;
          }
          textarea.focus();
          textarea.setSelectionRange(nextCursorPosition, nextCursorPosition);
        });

        clearMentionState();
        return nextValue;
      });
    },
    [clearMentionState, createReferenceInsertion, mentionState, setInputValue],
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
    resetReferenceMarkers();
    resetAfterSubmit();
  }, [
    adapter,
    attachments,
    decodeMarkersToCanonicalTokens,
    inputValue,
    resetAfterSubmit,
    resetReferenceMarkers,
    state.composer.status,
  ]);

  const handleFilesSelected = useCallback(
    (files: FileList | File[]) => {
      if (files.length === 0) {
        return;
      }
      setUploadError(null);
      void uploadFiles(files);
    },
    [setUploadError, uploadFiles],
  );

  const handleTextareaChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      const normalized = normalizeCanonicalTokensToMarkers(
        nextValue,
        event.target.selectionStart,
      );
      setInputValue(normalized.value);
      updateMentionState(normalized.value, normalized.cursorPosition);

      if (
        normalized.cursorPosition !== null &&
        normalized.cursorPosition !== event.target.selectionStart
      ) {
        const nextCursorPosition = normalized.cursorPosition;
        requestAnimationFrame(() => {
          const textarea = textareaRef.current;
          if (!textarea) {
            return;
          }
          textarea.setSelectionRange(nextCursorPosition, nextCursorPosition);
        });
      }
    },
    [normalizeCanonicalTokensToMarkers, setInputValue, updateMentionState],
  );

  const handleTextareaSelect = useCallback(
    (event: SyntheticEvent<HTMLTextAreaElement>) => {
      const target = event.currentTarget;
      updateMentionState(target.value, target.selectionStart);
    },
    [updateMentionState],
  );

  const handleTextareaScroll = useCallback(
    (event: UIEvent<HTMLTextAreaElement>) => {
      setComposerScrollOffset({
        top: event.currentTarget.scrollTop,
        left: event.currentTarget.scrollLeft,
      });
    },
    [setComposerScrollOffset],
  );

  const handleTextareaKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionState) {
        if (event.key === "ArrowDown" && mentionSuggestions.length > 0) {
          event.preventDefault();
          cycleMentionActiveIndex(1, mentionSuggestions.length);
          return;
        }

        if (event.key === "ArrowUp" && mentionSuggestions.length > 0) {
          event.preventDefault();
          cycleMentionActiveIndex(-1, mentionSuggestions.length);
          return;
        }

        if (
          event.key === "Enter" &&
          !event.shiftKey &&
          mentionSuggestions.length > 0
        ) {
          event.preventDefault();
          const selectedSuggestion =
            mentionSuggestions[mentionActiveIndex] ?? mentionSuggestions[0];
          if (selectedSuggestion) {
            insertMention(selectedSuggestion);
          }
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          clearMentionState();
          return;
        }
      }

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSubmit();
      }
    },
    [
      clearMentionState,
      cycleMentionActiveIndex,
      handleSubmit,
      insertMention,
      mentionActiveIndex,
      mentionState,
      mentionSuggestions,
    ],
  );

  const handleTextareaPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      if (!event.clipboardData?.files?.length) {
        return;
      }

      event.preventDefault();
      handleFilesSelected(event.clipboardData.files);
    },
    [handleFilesSelected],
  );

  const handleTextareaDrop = useCallback(
    (event: DragEvent<HTMLTextAreaElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer.files.length > 0) {
        handleFilesSelected(event.dataTransfer.files);
      }
    },
    [handleFilesSelected],
  );

  const handleTextareaDragOver = useCallback(
    (event: DragEvent<HTMLTextAreaElement>) => {
      event.preventDefault();
      event.stopPropagation();
    },
    [],
  );

  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}
    >
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-5 overflow-hidden",
          uiState.padding,
        )}
      >
        <LoopieConversationMessages
          messages={state.messages}
          composerStatus={state.composer.status}
          entryReferenceTitles={entryReferenceTitles}
          scrollContainerRef={scrollContainerRef}
        />
      </div>

      <LoopieComposer
        state={state}
        focus={focus}
        composerPlaceholder={composerPlaceholder}
        helperText={uiState.helperText}
        padding={uiState.padding}
        composerSurface={uiState.composerSurface}
        isOnline={isOnline}
        inputValue={inputValue}
        attachments={attachments}
        uploadError={uploadError}
        dictationError={dictationError}
        dictationStatus={dictationStatus}
        dictationInputLevel={dictationInputLevel}
        dictationElapsedSeconds={dictationElapsedSeconds}
        isDictationSupported={isDictationSupported}
        isUploading={isUploading}
        isTextareaDisabled={uiState.isTextareaDisabled}
        isDictating={uiState.isDictating}
        isTranscribingDictation={uiState.isTranscribingDictation}
        isDictationDisabled={uiState.isDictationDisabled}
        isSendDisabled={uiState.isSendDisabled}
        showStopButton={uiState.showStopButton}
        acceptTypes={ACCEPT_TYPES}
        textareaRef={textareaRef}
        fileInputRef={fileInputRef}
        mentionState={mentionState}
        mentionSuggestions={mentionSuggestions}
        mentionActiveIndex={mentionActiveIndex}
        inlineReferenceSegments={inlineReferenceSegments}
        hasInlineReferences={hasInlineReferences}
        composerScrollOffset={composerScrollOffset}
        onRemoveAttachment={removeAttachment}
        onFilesSelected={handleFilesSelected}
        onTextareaChange={handleTextareaChange}
        onTextareaSelect={handleTextareaSelect}
        onTextareaScroll={handleTextareaScroll}
        onTextareaKeyDown={handleTextareaKeyDown}
        onTextareaPaste={handleTextareaPaste}
        onTextareaDrop={handleTextareaDrop}
        onTextareaDragOver={handleTextareaDragOver}
        onMentionSelect={insertMention}
        onSubmit={handleSubmit}
        onStopResponse={adapter.stopResponse}
        stopDictation={stopDictation}
        clearDictationError={clearDictationError}
        toggleDictation={toggleDictation}
      />
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
