import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, RotateCcw, Square } from "lucide-react";

import { useAgentConversationContext } from "@/context/AgentConversationContext";
import {
  type AgentConversationAdapter,
  type AgentConversationState,
} from "@/lib/types/agent";
import { cn } from "@/lib/utils";

import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { ChatMessage } from "./chat/ChatMessage";
import { type AgentToolSignal } from "@/lib/types/agent";

interface LoopieConversationContentProps {
  state: AgentConversationState;
  adapter: AgentConversationAdapter;
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
  className,
  surfaceVariant = "panel",
  composerPlaceholder = "Ask about your content, growth, or next video idea…",
  idleHelperText,
  respondingHelperText,
  disabled = false,
}: LoopieConversationContentProps) {
  const [inputValue, setInputValue] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const isTextareaDisabled = disabled || state.composer.status === "responding";
  const isSendDisabled =
    disabled || state.composer.status !== "idle" || inputValue.trim() === "";
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
    if (!trimmed) {
      return;
    }
    void adapter.sendMessage(trimmed);
    setInputValue("");
  }, [adapter, inputValue, state.composer.status]);

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
          <ToolSignals signals={state.toolSignals} />
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
  const { state, adapter, isDemo, isInitializing } =
    useAgentConversationContext();
  return (
    <LoopiePanelView
      state={state}
      adapter={adapter}
      isDemo={isDemo}
      isInitializing={isInitializing}
      variant={variant}
      className={className}
    />
  );
}

interface ToolSignalsProps {
  signals: AgentToolSignal[];
}

function ToolSignals({ signals }: ToolSignalsProps) {
  if (signals.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 pl-1">
      {signals.map((signal) => (
        <div
          key={signal.id}
          className="flex items-center gap-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          <div className="flex flex-col leading-tight">
            <span className="text-xs text-muted-foreground">
              {signal.message}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
