import { useState, type MouseEventHandler, type ReactNode, type UIEvent } from "react";

import { cn } from "@/lib/utils";

interface StickyHeaderScrollableCardProps {
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  stickyHeaderAt?: "lg" | "none";
  mobileStickyTitle?: ReactNode;
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
  mobileStickyTitle,
  footerStickToBottomWhenShort = false,
  className,
  bodyClassName,
  onBodyClick,
}: StickyHeaderScrollableCardProps) {
  const [showMobileStickyTitle, setShowMobileStickyTitle] = useState(false);

  const handleBodyScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!mobileStickyTitle) {
      return;
    }
    const nextShowSticky = event.currentTarget.scrollTop > 72;
    if (nextShowSticky !== showMobileStickyTitle) {
      setShowMobileStickyTitle(nextShowSticky);
    }
  };

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
        <header
          className={cn(
            "flex flex-shrink-0 flex-col gap-4 p-6 pb-4 transition-[max-height,opacity,padding] duration-200",
            showMobileStickyTitle &&
              mobileStickyTitle &&
              "max-h-0 overflow-hidden py-0 opacity-0 lg:max-h-[20rem] lg:p-6 lg:pb-4 lg:opacity-100",
          )}
        >
          {header}
        </header>

        <div
          className={cn(
            "h-px w-full bg-border",
            showMobileStickyTitle && mobileStickyTitle && "hidden lg:block",
          )}
          aria-hidden="true"
        />

        <div
          className={cn(
            "scrollbar-hide flex min-h-0 flex-1 flex-col overflow-y-auto p-6 pt-4",
            bodyClassName,
          )}
          onScroll={handleBodyScroll}
          onClick={onBodyClick}
        >
          {mobileStickyTitle ? (
            <div
              className={cn(
                "pointer-events-none sticky top-0 z-10 -mx-6 mb-4 border-b border-border/80 bg-background/95 px-6 py-2 text-sm font-medium text-foreground backdrop-blur transition-opacity duration-200 lg:hidden",
                showMobileStickyTitle ? "opacity-100" : "opacity-0",
              )}
              aria-hidden={!showMobileStickyTitle}
            >
              <p className="truncate">{mobileStickyTitle}</p>
            </div>
          ) : null}

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

