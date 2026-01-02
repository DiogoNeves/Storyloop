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
