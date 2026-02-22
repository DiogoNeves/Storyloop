import { memo } from "react";

import { type AgentMessage } from "@/lib/types/agent";
import { cn } from "@/lib/utils";
import { CopyMarkdownButton } from "@/components/CopyMarkdownButton";

import { MarkdownMessage } from "./MarkdownMessage";
import { AssetAttachmentList } from "./AssetAttachmentList";
import { getToneLayout, resolveTone } from "./toneStyles";

interface ChatMessageProps {
  message: AgentMessage;
  entryReferenceTitles?: Record<string, string>;
}

function ChatMessageComponent({
  message,
  entryReferenceTitles,
}: ChatMessageProps) {
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
    <div className={cn("group relative flex w-full flex-col gap-2", toneLayout.alignment)}>
      <div
        className={cn(
          "relative text-sm transition-transform",
          toneLayout.bubble,
        )}
      >
        <MarkdownMessage
          content={message.content}
          className="leading-relaxed"
          tone={tone}
          entryReferenceTitles={entryReferenceTitles}
        />
        <div className="pointer-events-none absolute bottom-0 right-0 z-10 translate-y-full opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
          <div className="[&_button]:h-6 [&_button]:w-6 [&_button_svg]:h-3 [&_button_svg]:w-3">
            <CopyMarkdownButton
              getContent={() => message.content}
              label="Copy message"
              title="Copy message"
            />
          </div>
        </div>
      </div>
      {message.attachments && message.attachments.length > 0 ? (
        <AssetAttachmentList attachments={message.attachments} />
      ) : null}
    </div>
  );
}

export const ChatMessage = memo(ChatMessageComponent);
ChatMessage.displayName = "ChatMessage";
