import { FileText, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type AgentMessageAttachment } from "@/lib/types/agent";
import { cn } from "@/lib/utils";
import { isImageAsset, resolveAssetUrl } from "@/lib/assets";

interface AssetAttachmentListProps {
  attachments: AgentMessageAttachment[];
  onRemove?: (attachmentId: string) => void;
  className?: string;
}

export function AssetAttachmentList({
  attachments,
  onRemove,
  className,
}: AssetAttachmentListProps) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {attachments.map((attachment) => {
        const assetUrl = resolveAssetUrl(attachment.url);
        const isImage = isImageAsset(attachment.mimeType);

        return (
          <div
            key={attachment.id}
            className="group relative overflow-hidden rounded-xl border border-border/60 bg-muted/20"
          >
            {isImage ? (
              <img
                src={assetUrl}
                alt={attachment.filename}
                className="h-32 w-full object-cover"
                loading="lazy"
              />
            ) : (
              <a
                href={assetUrl}
                target="_blank"
                rel="noreferrer"
                className="flex h-32 flex-col justify-between gap-2 p-3 text-sm"
              >
                <FileText className="h-5 w-5 text-primary" />
                <div>
                  <p className="line-clamp-2 font-medium text-foreground">
                    {attachment.filename}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {attachment.mimeType}
                  </p>
                </div>
              </a>
            )}
            {onRemove ? (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute right-2 top-2 h-7 w-7 rounded-full opacity-0 transition group-hover:opacity-100"
                onClick={() => {
                  onRemove(attachment.id);
                }}
                aria-label={`Remove ${attachment.filename}`}
              >
                <X className="h-3 w-3" />
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
