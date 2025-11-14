import { Fragment, useEffect, useMemo, useRef, useState } from "react";

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
          "max-w-[85%] rounded-2xl border px-4 py-3 text-sm leading-relaxed shadow-sm transition-transform",
          isAssistant &&
            "border-primary/40 bg-gradient-to-br from-primary/90 to-primary text-primary-foreground",
          isUser &&
            "border-border bg-background/80 text-foreground backdrop-blur supports-[backdrop-filter]:bg-background/60",
        )}
      >
        {formattedContent}
      </div>
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/80">
        {isAssistant ? "Storyloop Agent" : "You"}
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
          className="group inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground transition hover:border-primary/60 hover:text-primary"
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
      ? "Agent is thinking"
      : state.composer.status === "sending"
        ? "Sending"
        : "Ask the agent";

  return (
    <aside className="relative flex h-full min-h-[520px] flex-col">
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent blur-3xl" />
      <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-primary/30 bg-background/90 shadow-[0_20px_45px_-20px_rgba(12,10,60,0.45)] backdrop-blur">
        <header className="flex items-start gap-3 border-b border-border/60 px-6 py-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-primary-foreground shadow-lg">
            SL
          </div>
          <div className="flex flex-1 flex-col">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight">
                  Storyloop Agent
                </h2>
                <p className="text-xs text-muted-foreground">
                  Personalized growth guidance {isDemo ? "(demo)" : null}
                </p>
              </div>
              <span className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-500">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                Online
              </span>
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-6 overflow-hidden px-6 py-5">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-muted-foreground/80">
            <span>Conversation</span>
            <button
              type="button"
              onClick={() => adapter.resetConversation()}
              className="text-muted-foreground transition hover:text-foreground"
            >
              Reset
            </button>
          </div>

          <div
            ref={scrollContainerRef}
            className="flex-1 space-y-6 overflow-y-auto pr-2"
          >
            {state.messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {state.composer.status === "responding" ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="h-2 w-2 animate-ping rounded-full bg-primary" />
                Preparing insight…
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <SuggestionsList
              suggestions={state.suggestedPrompts}
              onSelect={adapter.acknowledgeSuggestion}
            />

            <div className="rounded-2xl border border-border/70 bg-background/80 p-4 shadow-inner backdrop-blur">
              <label
                htmlFor="agent-composer"
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground/80"
              >
                {composerLabel}
              </label>
              <Textarea
                id="agent-composer"
                placeholder="Draft a new hook, ask for insights, or plan your next move…"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSubmit();
                  }
                }}
                disabled={isComposerDisabled}
                className="min-h-[96px] resize-none border-none bg-muted/20 px-4 py-3 text-sm shadow-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              {state.composer.error ? (
                <p className="mt-2 text-xs text-destructive">
                  {state.composer.error}
                </p>
              ) : null}
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>
                  {state.composer.status === "responding"
                    ? "Synthesizing a tailored suggestion"
                    : "Use Shift + Enter for a new line"}
                </span>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isComposerDisabled}
                  className="bg-gradient-to-r from-primary via-primary/80 to-primary text-primary-foreground shadow-lg hover:from-primary/90 hover:to-primary/80"
                >
                  Send
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

