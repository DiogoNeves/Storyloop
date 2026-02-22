import type { RefObject } from "react";

import { ChatMessage } from "@/components/chat/ChatMessage";
import type { AgentConversationState } from "@/lib/types/agent";

interface LoopieConversationMessagesProps {
  messages: AgentConversationState["messages"];
  composerStatus: AgentConversationState["composer"]["status"];
  entryReferenceTitles: Record<string, string>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

export function LoopieConversationMessages({
  messages,
  composerStatus,
  entryReferenceTitles,
  scrollContainerRef,
}: LoopieConversationMessagesProps) {
  return (
    <div
      ref={scrollContainerRef}
      className="scrollbar-hide min-h-0 flex-1 space-y-5 overflow-y-auto"
    >
      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground/40">
          Loopie here, let&apos;s chat. 😊
        </p>
      ) : null}
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          message={message}
          entryReferenceTitles={entryReferenceTitles}
        />
      ))}
      {composerStatus === "responding" ? (
        <div className="flex items-center gap-2 pl-1 text-xs text-muted-foreground">
          <span className="h-2 w-2 animate-ping rounded-full bg-primary" />
          Loopie is preparing insight…
        </div>
      ) : null}
    </div>
  );
}
