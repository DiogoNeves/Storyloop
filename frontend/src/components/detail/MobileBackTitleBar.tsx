import { ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

interface MobileBackTitleBarProps {
  backTo: string;
  title: string;
  ariaLabel?: string;
  className?: string;
}

export function MobileBackTitleBar({
  backTo,
  title,
  ariaLabel = "Back to activity feed",
  className,
}: MobileBackTitleBarProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Link
        to={backTo}
        aria-label={ariaLabel}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/70 text-foreground transition-colors hover:bg-muted"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Link>
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {title}
      </p>
    </div>
  );
}
