import { memo } from "react";

import { type AgentMessage } from "@/lib/types/agent";
import { cn } from "@/lib/utils";

import { MarkdownMessage } from "./MarkdownMessage";
import { AssetAttachmentList } from "./AssetAttachmentList";
import { getToneLayout, resolveTone } from "./toneStyles";

interface ChatMessageProps {
  message: AgentMessage;
}

function ChatMessageComponent({ message }: ChatMessageProps) {
  if (message.role === "tool") {
    return (
      <div className="space-y-2 pl-1">
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          <div className="flex flex-col leading-tight">
            <span className="text-xs text-muted-foreground">
              {message.content}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const tone = resolveTone(message.role);
  const toneLayout = getToneLayout(tone);

  return (
    <div className={cn("flex w-full flex-col gap-2", toneLayout.alignment)}>
      <div className={cn("group relative text-sm transition-transform", toneLayout.bubble)}>
        <MarkdownMessage
          content={message.content}
          className="leading-relaxed"
          tone={tone}
        />
      </div>
      {message.attachments && message.attachments.length > 0 ? (
        <AssetAttachmentList attachments={message.attachments} />
      ) : null}
    </div>
  );
}

export const ChatMessage = memo(ChatMessageComponent);
ChatMessage.displayName = "ChatMessage";
