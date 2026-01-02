import { useQuery } from "@tanstack/react-query";
import { FileText, ArrowUpRight } from "lucide-react";

import { getAssetMeta } from "@/api/assets";
import { cn } from "@/lib/utils";
import { formatBytes, resolveAssetUrl } from "@/lib/assets";

interface AssetLinkCardProps {
  assetId: string;
  href: string;
  label?: string;
  className?: string;
}

export function AssetLinkCard({
  assetId,
  href,
  label,
  className,
}: AssetLinkCardProps) {
  const { data } = useQuery({
    queryKey: ["asset-meta", assetId],
    queryFn: () => getAssetMeta(assetId),
  });

  const filename = data?.filename ?? label ?? "Asset";
  const mimeType = data?.mimeType ?? "file";
  const size = data?.sizeBytes ? formatBytes(data.sizeBytes) : null;
  const assetUrl = resolveAssetUrl(href);

  return (
    <a
      href={assetUrl}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-sm transition hover:border-primary/40",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background/70">
          <FileText className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="line-clamp-1 font-medium text-foreground">
            {filename}
          </p>
          <p className="text-xs text-muted-foreground">
            {mimeType}
            {size ? ` • ${size}` : ""}
          </p>
        </div>
      </div>
      <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
    </a>
  );
}
