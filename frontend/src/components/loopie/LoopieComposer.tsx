import type {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  KeyboardEvent,
  RefObject,
  SyntheticEvent,
  UIEvent,
} from "react";
import { ArrowUp, ImagePlus, Mic, Square, WifiOff } from "lucide-react";

import { AssetAttachmentList } from "@/components/chat/AssetAttachmentList";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VoiceWave } from "@/components/ui/voice-wave";
import type { AudioInputDeviceOption } from "@/hooks/useAudioInputDevices";
import { cn } from "@/lib/utils";
import type {
  AgentConversationState,
  AgentFocus,
  AgentMessageAttachment,
} from "@/lib/types/agent";
import type { ActivityItem } from "@/lib/types/entries";
import type { ComposerMentionState } from "@/hooks/useLoopieComposerState";
import type { InlineReferenceSegment } from "@/hooks/useLoopieReferenceComposer";

import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

interface LoopieComposerProps {
  state: AgentConversationState;
  focus?: AgentFocus | null;
  composerPlaceholder: string;
  helperText: string;
  padding: string;
  composerSurface: string;
  isOnline: boolean;
  inputValue: string;
  attachments: AgentMessageAttachment[];
  uploadError: string | null;
  dictationError: string | null;
  dictationStatus: "idle" | "recording" | "transcribing";
  dictationInputLevel: number;
  dictationElapsedSeconds: number;
  isDictationSupported: boolean;
  isAudioInputSelectionSupported: boolean;
  audioInputDevices: AudioInputDeviceOption[];
  selectedAudioInputDeviceId: string;
  isUploading: boolean;
  isTextareaDisabled: boolean;
  isDictating: boolean;
  isTranscribingDictation: boolean;
  isDictationDisabled: boolean;
  isSendDisabled: boolean;
  showStopButton: boolean;
  acceptTypes: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  mentionState: ComposerMentionState | null;
  mentionSuggestions: ActivityItem[];
  mentionActiveIndex: number;
  inlineReferenceSegments: InlineReferenceSegment[];
  hasInlineReferences: boolean;
  composerScrollOffset: { top: number; left: number };
  onRemoveAttachment: (attachmentId: string) => void;
  onFilesSelected: (files: FileList | File[]) => void;
  onTextareaChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onTextareaSelect: (event: SyntheticEvent<HTMLTextAreaElement>) => void;
  onTextareaScroll: (event: UIEvent<HTMLTextAreaElement>) => void;
  onTextareaKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onTextareaPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onTextareaDrop: (event: DragEvent<HTMLTextAreaElement>) => void;
  onTextareaDragOver: (event: DragEvent<HTMLTextAreaElement>) => void;
  onMentionSelect: (selection: ActivityItem) => void;
  onSubmit: () => void;
  onStopResponse: () => void;
  stopDictation: () => void;
  toggleDictation: () => Promise<void>;
  onSelectAudioInputDevice: (deviceId: string) => void;
}

export function LoopieComposer({
  state,
  focus,
  composerPlaceholder,
  helperText,
  padding,
  composerSurface,
  isOnline,
  inputValue,
  attachments,
  uploadError,
  dictationError,
  dictationStatus,
  dictationInputLevel,
  dictationElapsedSeconds,
  isDictationSupported,
  isAudioInputSelectionSupported,
  audioInputDevices,
  selectedAudioInputDeviceId,
  isUploading,
  isTextareaDisabled,
  isDictating,
  isTranscribingDictation,
  isDictationDisabled,
  isSendDisabled,
  showStopButton,
  acceptTypes,
  textareaRef,
  fileInputRef,
  mentionState,
  mentionSuggestions,
  mentionActiveIndex,
  inlineReferenceSegments,
  hasInlineReferences,
  composerScrollOffset,
  onRemoveAttachment,
  onFilesSelected,
  onTextareaChange,
  onTextareaSelect,
  onTextareaScroll,
  onTextareaKeyDown,
  onTextareaPaste,
  onTextareaDrop,
  onTextareaDragOver,
  onMentionSelect,
  onSubmit,
  onStopResponse,
  stopDictation,
  toggleDictation,
  onSelectAudioInputDevice,
}: LoopieComposerProps) {
  const focusLabel = focus ? focus.category : null;
  const focusTooltip = focus
    ? `${focus.category} · ${focus.title ? String(focus.title) : focus.id}`
    : null;

  return (
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
        {uploadError ? <p className="text-xs text-destructive">{uploadError}</p> : null}
        {dictationError ? (
          <p className="text-xs text-destructive">{dictationError}</p>
        ) : null}
        {!isOnline ? (
          <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
            <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>You're offline. Messages can't be sent right now.</span>
          </div>
        ) : null}

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
            onFilesSelected(event.target.files);
            event.target.value = "";
          }}
        />

        {attachments.length > 0 ? (
          <AssetAttachmentList
            attachments={attachments}
            onRemove={(attachmentId) => {
              onRemoveAttachment(attachmentId);
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
            {isAudioInputSelectionSupported && audioInputDevices.length > 0 ? (
              <Select
                value={selectedAudioInputDeviceId}
                onValueChange={onSelectAudioInputDevice}
                disabled={dictationStatus !== "idle"}
              >
                <SelectTrigger
                  id="loopie-audio-input-device"
                  className="h-8 w-48 text-xs text-foreground"
                  aria-label="Select microphone"
                >
                  <SelectValue placeholder="Microphone" />
                </SelectTrigger>
                <SelectContent>
                  {audioInputDevices.map((device) => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {isUploading ? <span>Uploading…</span> : null}
            {focusLabel ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-[10px] text-muted-foreground/60">
                    👀 {focusLabel}
                  </span>
                </TooltipTrigger>
                {focusTooltip ? <TooltipContent>{focusTooltip}</TooltipContent> : null}
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
                      return <span key={`text-${index}`}>{segment.value}</span>;
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
              onChange={onTextareaChange}
              onSelect={onTextareaSelect}
              onScroll={onTextareaScroll}
              onKeyDown={onTextareaKeyDown}
              onPaste={onTextareaPaste}
              onDrop={onTextareaDrop}
              onDragOver={onTextareaDragOver}
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
                  onClick={onStopResponse}
                  className="h-9 w-9 rounded-full bg-destructive/90 p-0 text-destructive-foreground shadow-lg transition hover:bg-destructive"
                  aria-label="Stop response"
                >
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={onSubmit}
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
                          onMentionSelect(item);
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
  );
}

function formatDuration(seconds: number): string {
  const normalizedSeconds = Math.max(0, seconds);
  const minutes = Math.floor(normalizedSeconds / 60);
  const remainingSeconds = normalizedSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}
