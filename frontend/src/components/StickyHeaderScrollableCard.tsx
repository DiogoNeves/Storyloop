import { useState, type MouseEventHandler, type ReactNode, type UIEvent } from "react";

import { cn } from "@/lib/utils";

interface StickyHeaderScrollableCardProps {
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  stickyHeaderAt?: "lg" | "none";
  mobileCollapsedHeader?: ReactNode;
  mobileCollapseThreshold?: number;
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
  mobileCollapsedHeader,
  mobileCollapseThreshold = 56,
  footerStickToBottomWhenShort = false,
  className,
  bodyClassName,
  onBodyClick,
}: StickyHeaderScrollableCardProps) {
  const [showMobileCollapsedHeader, setShowMobileCollapsedHeader] =
    useState(false);

  const handleBodyScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!mobileCollapsedHeader) {
      return;
    }
    const nextShowCollapsed =
      event.currentTarget.scrollTop > mobileCollapseThreshold;
    if (nextShowCollapsed !== showMobileCollapsedHeader) {
      setShowMobileCollapsedHeader(nextShowCollapsed);
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
        {mobileCollapsedHeader ? (
          <div
            data-testid="mobile-collapsed-header"
            className={cn(
              "flex-shrink-0 overflow-hidden border-border/80 bg-background/95 px-4 backdrop-blur transition-[max-height,opacity,padding,border-width] duration-200 lg:hidden",
              showMobileCollapsedHeader
                ? "max-h-16 border-b py-2 opacity-100"
                : "pointer-events-none max-h-0 border-b-0 py-0 opacity-0",
            )}
            aria-hidden={!showMobileCollapsedHeader}
          >
            {mobileCollapsedHeader}
          </div>
        ) : null}

        <header
          className={cn(
            "flex flex-shrink-0 flex-col gap-4 p-6 pb-4 transition-[max-height,opacity,padding] duration-200",
            showMobileCollapsedHeader &&
              mobileCollapsedHeader &&
              "max-h-0 overflow-hidden py-0 opacity-0 lg:max-h-[20rem] lg:p-6 lg:pb-4 lg:opacity-100",
          )}
        >
          {header}
        </header>

        <div
          className={cn(
            "h-px w-full bg-border",
            showMobileCollapsedHeader && mobileCollapsedHeader && "hidden lg:block",
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
