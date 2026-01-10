import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, ImagePlus, RotateCcw, Square, WifiOff } from "lucide-react";

import { useAgentConversationContext } from "@/context/AgentConversationContext";
import {
  type AgentConversationAdapter,
  type AgentConversationState,
  type AgentFocus,
  type AgentMessageAttachment,
} from "@/lib/types/agent";
import { getActivityCategoryLabel } from "@/lib/activity-helpers";
import { cn } from "@/lib/utils";
import { useAssetUpload } from "@/hooks/useAssetUpload";
import { useSync } from "@/hooks/useSync";
import { AssetAttachmentList } from "@/components/chat/AssetAttachmentList";

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
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { isOnline } = useSync();

  const isTextareaDisabled = disabled || state.composer.status === "responding";
  const isSendDisabled =
    disabled ||
    state.composer.status !== "idle" ||
    (inputValue.trim() === "" && attachments.length === 0);
  const showStopButton =
    state.composer.status === "sending" ||
    state.composer.status === "responding";

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

  const handleSubmit = useCallback(() => {
    if (state.composer.status !== "idle") {
      return;
    }
    const trimmed = inputValue.trim();
    if (!trimmed && attachments.length === 0) {
      return;
    }
    void adapter.sendMessage(trimmed, attachments);
    setInputValue("");
    setAttachments([]);
  }, [adapter, attachments, inputValue, state.composer.status]);

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
  const acceptTypes = "image/*,application/pdf";

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

  const focusLabel = focus ? getActivityCategoryLabel(focus.category) : null;
  const focusTooltip = focus
    ? `${getActivityCategoryLabel(focus.category)} · ${focus.title ? String(focus.title) : focus.id}`
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
            <ChatMessage key={message.id} message={message} />
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
              Add image or PDF
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
          <div className="relative flex select-none items-end rounded-2xl border border-border/50 bg-muted/30 shadow-sm focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
            <Textarea
              id="agent-composer"
              placeholder={composerPlaceholder}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => {
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
              className="min-h-[104px] resize-none rounded-2xl border-0 bg-transparent px-4 py-3 pr-24 text-sm shadow-none focus-visible:outline-none focus-visible:ring-0"
            />
            <div className="absolute bottom-3 right-3 flex select-none items-center gap-2">
              <span className="hidden text-[10px] text-muted-foreground/70 sm:inline">
                {state.composer.status === "responding"
                  ? "Loopie is thinking"
                  : "Shift + Enter"}
              </span>
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
          <p className="text-[10px] text-muted-foreground/70">{helperText}</p>
        </div>
      </div>
    </div>
  );
}

export function LoopiePanelView({
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

