import { memo, useMemo } from "react";

import { type AgentMessage } from "@/lib/types/agent";
import { cn } from "@/lib/utils";

import { MarkdownMessage } from "./MarkdownMessage";

interface ChatMessageProps {
  message: AgentMessage;
}

function ChatMessageComponent({ message }: ChatMessageProps) {
  const roleVariant = useMemo(() => {
    const isAssistant = message.role === "assistant";
    const isUser = message.role === "user";

    return {
      alignment: isUser ? "items-end" : "items-start",
      bubble: isUser
        ? "max-w-[88%] rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/70 via-primary/60 to-primary/55 px-5 py-4 text-primary-foreground shadow-sm"
        : "w-full rounded-2xl bg-transparent px-4 py-2 text-foreground/90",
      text: isAssistant ? "text-foreground/90" : "text-primary-foreground/95",
    };
  }, [message.role]);

  return (
    <div className={cn("flex w-full flex-col gap-2", roleVariant.alignment)}>
      <div className={cn("group relative text-sm transition-transform", roleVariant.bubble)}>
        <MarkdownMessage
          content={message.content}
          className={cn("leading-relaxed", roleVariant.text)}
          tone={message.role === "user" ? "user" : "default"}
        />
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageComponent);
ChatMessage.displayName = "ChatMessage";
