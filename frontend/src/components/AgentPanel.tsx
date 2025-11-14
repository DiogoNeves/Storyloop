import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Bot } from "lucide-react";

import { useAgentDemo } from "@/hooks";
import {
  type AgentConversationAdapter,
  type AgentConversationState,
  type AgentMessage,
  type AgentSuggestedPrompt,
} from "@/lib/types/agent";
import { cn } from "@/lib/utils";

import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

interface AgentPanelViewProps {
  state: AgentConversationState;
  adapter: AgentConversationAdapter;
  isDemo?: boolean;
}

function MessageBubble({ message }: { message: AgentMessage }) {
  const isAssistant = message.role === "assistant";
  const isUser = message.role === "user";

  const formattedContent = useMemo(() => {
    const lines = message.content.split("\n");
    return lines.map((line, index) => (
      <Fragment key={`${message.id}-${index}`}>
        {line}
        {index < lines.length - 1 ? <br /> : null}
      </Fragment>
    ));
  }, [message.content, message.id]);

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2",
        isUser ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "group relative max-w-[88%] rounded-3xl border px-5 py-4 text-sm shadow-sm transition-transform",
          isAssistant &&
            "border-primary/25 bg-gradient-to-br from-primary/70 via-primary/60 to-primary/55 text-primary-foreground",
          isUser &&
            "border-border bg-background/85 text-foreground backdrop-blur supports-[backdrop-filter]:bg-background/70",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.32em]",
            isAssistant
              ? "text-primary-foreground/80"
              : "text-muted-foreground/70",
          )}
        >
          {isAssistant ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-2xl border border-primary/30 bg-primary/15 text-primary-foreground">
              <Bot className="h-4 w-4" aria-hidden="true" />
            </span>
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-2xl border border-border/60 bg-muted/40 text-muted-foreground">
              You
            </span>
          )}
          {isAssistant ? "Loopie" : "You"}
        </div>
        <div
          className={cn(
            "mt-3 leading-relaxed",
            isAssistant ? "text-primary-foreground/95" : "text-foreground/90",
          )}
        >
          {formattedContent}
        </div>
      </div>
      <p className="text-[11px] uppercase tracking-[0.32em] text-muted-foreground/70">
        {isAssistant ? "Loopie" : "You"}
      </p>
    </div>
  );
}

function SuggestionsList({
  suggestions,
  onSelect,
}: {
  suggestions: AgentSuggestedPrompt[];
  onSelect: (suggestion: AgentSuggestedPrompt) => void;
}) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.id}
          type="button"
          onClick={() => onSelect(suggestion)}
          className="group inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.22em] text-primary transition hover:border-primary/50 hover:bg-primary/20"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-primary transition group-hover:scale-110" />
          {suggestion.label}
        </button>
      ))}
    </div>
  );
}

export function AgentPanelView({ state, adapter, isDemo = false }: AgentPanelViewProps) {
  const [inputValue, setInputValue] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const isComposerDisabled =
    state.composer.status === "sending" || state.composer.status === "responding";

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [state.messages, state.composer.status]);

  const handleSubmit = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      return;
    }
    void adapter.sendMessage(trimmed);
    setInputValue("");
  };

  const composerLabel =
    state.composer.status === "responding"
      ? "Loopie is thinking"
      : state.composer.status === "sending"
        ? "Sending to Loopie"
        : "Share your next move with Loopie";

  return (
    <aside className="relative flex h-full min-h-[520px] flex-col overflow-hidden rounded-[2rem] border border-primary/15 bg-background/98 shadow-[0_24px_70px_-50px_rgba(32,0,77,0.6)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-primary/12 via-primary/5 to-transparent opacity-60" />
      <div className="relative flex h-full flex-col">
        <header className="flex items-start gap-4 border-b border-border/40 px-6 py-5 backdrop-blur">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/15 text-primary">
            <Bot className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="flex flex-1 flex-col">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Loopie</h2>
                <p className="text-xs text-muted-foreground">
                  Your storytelling growth companion {isDemo ? "(demo)" : null}
                </p>
              </div>
              <span className="flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-0.5 text-xs font-medium text-emerald-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
                Online
              </span>
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-5 overflow-hidden px-6 py-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.32em] text-muted-foreground/80">
              <span>Conversation with Loopie</span>
              <button
                type="button"
                onClick={() => adapter.resetConversation()}
                className="rounded-full border border-transparent px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-muted-foreground transition hover:border-border/60 hover:text-foreground"
              >
                Reset
              </button>
            </div>
            <p className="text-xs text-muted-foreground/80">
              Loopie keeps notes on your wins and drafts guidance when you need a boost.
            </p>
          </div>

          <div ref={scrollContainerRef} className="flex-1 space-y-5 overflow-y-auto pr-1">
            {state.messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {state.composer.status === "responding" ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="h-2 w-2 animate-ping rounded-full bg-primary" />
                Loopie is preparing insight…
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <SuggestionsList
              suggestions={state.suggestedPrompts}
              onSelect={adapter.acknowledgeSuggestion}
            />

            <div className="rounded-[1.65rem] border border-border/50 bg-background/95 p-4 shadow-sm">
              <label
                htmlFor="agent-composer"
                className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.32em] text-muted-foreground/80"
              >
                {composerLabel}
              </label>
              <Textarea
                id="agent-composer"
                placeholder="Ask Loopie for feedback, spark a new idea, or plan your next release…"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSubmit();
                  }
                }}
                disabled={isComposerDisabled}
                className="min-h-[104px] resize-none border border-border/40 bg-muted/20 px-4 py-3 text-sm shadow-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              {state.composer.error ? (
                <p className="mt-2 text-xs text-destructive">
                  {state.composer.error}
                </p>
              ) : null}
              <div className="mt-4 flex flex-col gap-3 text-xs text-muted-foreground/90 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  {state.composer.status === "responding"
                    ? "Loopie is synthesizing a tailored suggestion"
                    : "Use Shift + Enter for a new line"}
                </span>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isComposerDisabled}
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-primary via-primary/80 to-primary text-primary-foreground shadow-lg transition hover:from-primary/90 hover:to-primary/80 disabled:opacity-60"
                >
                  Send to Loopie
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function AgentPanel() {
  const demo = useAgentDemo();

  return <AgentPanelView state={demo.state} adapter={demo.adapter} isDemo />;
}

