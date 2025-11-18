import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, Plus } from "lucide-react";

import { useAgentConversationContext } from "@/context/AgentConversationContext";
import {
  type AgentConversationAdapter,
  type AgentConversationState,
} from "@/lib/types/agent";
import { cn } from "@/lib/utils";

import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { ChatMessage } from "./chat/ChatMessage";

interface AgentPanelViewProps {
  state: AgentConversationState;
  adapter: AgentConversationAdapter;
  isDemo?: boolean;
}

interface AgentConversationContentProps {
  state: AgentConversationState;
  adapter: AgentConversationAdapter;
  className?: string;
  surfaceVariant?: "panel" | "page";
  composerPlaceholder?: string;
  idleHelperText?: string;
  respondingHelperText?: string;
  disabled?: boolean;
}

export function AgentConversationContent({
  state,
  adapter,
  className,
  surfaceVariant = "panel",
  composerPlaceholder = "Ask about your content, growth, or next video idea…",
  idleHelperText,
  respondingHelperText,
  disabled = false,
}: AgentConversationContentProps) {
  const [inputValue, setInputValue] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const isComposerDisabled =
    disabled ||
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
    const trimmed = inputValue.trim();
    if (!trimmed) {
      return;
    }
    void adapter.sendMessage(trimmed);
    setInputValue("");
  }, [adapter, inputValue]);

  const composerLabel =
    state.composer.status === "responding"
      ? "Loopie is thinking"
      : state.composer.status === "sending"
        ? "Sending to Loopie"
        : "Share your next move with Loopie";

  const padding = surfaceVariant === "panel" ? "px-6 py-5" : "px-4 py-4";
  const composerSurface =
    surfaceVariant === "panel"
      ? "bg-background/98 border-t border-border/40"
      : "bg-background/90 border-t border-border/50";
  const helperText =
    state.composer.status === "responding"
      ? respondingHelperText ?? "Loopie is synthesizing a tailored suggestion"
      : idleHelperText ?? composerLabel;

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      <div className={cn("flex min-h-0 flex-1 flex-col gap-5 overflow-hidden", padding)}>
        <div
          ref={scrollContainerRef}
          className="scrollbar-hide min-h-0 flex-1 space-y-5 overflow-y-auto pr-1"
        >
          {state.toolSignals.length > 0 ? (
            <div className="space-y-2">
              {state.toolSignals.map((signal) => (
                <div
                  key={signal.id}
                  className="flex items-center gap-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground"
                >
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  <div className="flex flex-col leading-tight">
                    <span className="font-medium text-foreground">
                      Loopie is checking…
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {signal.message}
                    </span>
                  </div>
                </div>
              ))}
            </div>
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
              disabled={isComposerDisabled}
              className="min-h-[104px] resize-none rounded-2xl border-0 bg-transparent px-4 py-3 pr-24 text-sm shadow-none focus-visible:outline-none focus-visible:ring-0"
            />
            <div className="absolute bottom-3 right-3 flex select-none items-center gap-2">
              <span className="hidden text-[10px] text-muted-foreground/70 sm:inline">
                {state.composer.status === "responding"
                  ? "Loopie is thinking"
                  : "Shift + Enter"}
              </span>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isComposerDisabled}
                className="h-9 w-9 rounded-full bg-gradient-to-r from-primary via-primary/80 to-primary p-0 text-primary-foreground shadow-lg transition hover:from-primary/90 hover:to-primary/80 disabled:opacity-60"
                aria-label="Send to Loopie"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground/70">{helperText}</p>
        </div>
      </div>
    </div>
  );
}

export function AgentPanelView({ state, adapter, isDemo }: AgentPanelViewProps) {
  return (
    <aside className="bg-background/98 relative flex h-full w-full flex-1 flex-col overflow-hidden rounded-2xl border border-primary/15 shadow-[0_24px_70px_-50px_rgba(32,0,77,0.6)]">
      <div className="from-primary/12 pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b via-primary/5 to-transparent opacity-60" />
      <div className="relative flex h-full flex-col">
        <header className="flex items-start gap-4 border-b border-border/40 px-3 py-3 backdrop-blur">
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
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>
        <AgentConversationContent state={state} adapter={adapter} />
      </div>
    </aside>
  );
}

export function AgentPanel() {
  const { state, adapter, isDemo } = useAgentConversationContext();
  return (
    <AgentPanelView state={state} adapter={adapter} isDemo={isDemo} />
  );
}
