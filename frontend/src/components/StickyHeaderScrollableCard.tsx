import type { MouseEventHandler, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface StickyHeaderScrollableCardProps {
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  stickyHeaderAt?: "lg" | "none";
  footerStickToBottomWhenShort?: boolean;
  className?: string;
  bodyClassName?: string;
  onBodyClick?: MouseEventHandler<HTMLDivElement>;
}

export function StickyHeaderScrollableCard({
  header,
  children,
  footer,
  stickyHeaderAt = "none",
  footerStickToBottomWhenShort = false,
  className,
  bodyClassName,
  onBodyClick,
}: StickyHeaderScrollableCardProps) {
  // For lg screens with sticky header, we need a different structure:
  // header is outside scroll container and fixed, separator is between header and scroll area
  if (stickyHeaderAt === "lg" && header) {
    return (
      <section
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-sm",
          className,
        )}
      >
        <header className="flex flex-shrink-0 flex-col gap-4 p-6 pb-4">
          {header}
        </header>

        <div className="h-px w-full bg-border" aria-hidden="true" />

        <div
          className={cn(
            "scrollbar-hide flex min-h-0 flex-1 flex-col overflow-y-auto p-6 pt-4",
            bodyClassName,
          )}
          onClick={onBodyClick}
        >
          {children}

          {footer ? (
            <div
              className={cn("pt-6", footerStickToBottomWhenShort && "mt-auto")}
            >
              {footer}
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  // Default: simple scrollable card without sticky header
  return (
    <section
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-sm",
        className,
      )}
    >
      <div
        className={cn(
          "scrollbar-hide flex min-h-0 flex-1 flex-col overflow-y-auto p-6",
          bodyClassName,
        )}
        onClick={onBodyClick}
      >
        {header ? (
          <>
            <div className="flex flex-shrink-0 flex-col gap-4 pb-4">
              {header}
            </div>
            <div className="h-px w-full bg-border" aria-hidden="true" />
            <div className="pt-4">{children}</div>
          </>
        ) : (
          children
        )}

        {footer ? (
          <div
            className={cn("pt-6", footerStickToBottomWhenShort && "mt-auto")}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </section>
  );
}



