import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router-dom";
import { WifiOff } from "lucide-react";

import { youtubeQueries } from "@/api/youtube";
import { useSync } from "@/hooks/useSync";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavBarProps {
  onOpenSettings?: () => void;
}

export function NavBar({ onOpenSettings }: NavBarProps) {
  const { isOnline } = useSync();
  const linkStatusQuery = useQuery(youtubeQueries.authStatus());
  const [thumbnailError, setThumbnailError] = useState(false);

  const channel = linkStatusQuery.data?.channel;
  const channelThumbnailUrl = channel?.thumbnailUrl?.trim() ?? null;
  const hasValidThumbnail =
    channelThumbnailUrl !== null &&
    (channelThumbnailUrl.startsWith("http://") ||
      channelThumbnailUrl.startsWith("https://"));
  const shouldShowProfileImage =
    Boolean(linkStatusQuery.data?.linked) && hasValidThumbnail && !thumbnailError;

  useEffect(() => {
    setThumbnailError(false);
  }, [channelThumbnailUrl]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full items-center justify-between px-6 lg:px-10 xl:px-16">
        <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          {shouldShowProfileImage && channelThumbnailUrl ? (
            <img
              src={channelThumbnailUrl}
              alt={`${channel?.title ?? "YouTube"} profile`}
              className="h-10 w-10 shrink-0 rounded-full sm:hidden"
              loading="lazy"
              onError={() => setThumbnailError(true)}
            />
          ) : (
            <span className="rounded-md bg-primary px-2 py-1 text-primary-foreground sm:hidden">
              S
            </span>
          )}
          <span className="hidden rounded-md bg-primary px-2 py-1 text-primary-foreground sm:inline">
            Storyloop
          </span>
          {shouldShowProfileImage && channelThumbnailUrl ? (
            <img
              src={channelThumbnailUrl}
              alt={`${channel?.title ?? "YouTube"} profile`}
              className="hidden h-8 w-8 shrink-0 rounded-full sm:inline-block"
              loading="lazy"
              onError={() => setThumbnailError(true)}
            />
          ) : null}
          <span className="hidden text-sm text-muted-foreground sm:inline">
            Content journal
          </span>
          {!isOnline && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="ml-1 flex items-center">
                  <WifiOff
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="sr-only">You are offline</span>
                </span>
              </TooltipTrigger>
              <TooltipContent>You are offline</TooltipContent>
            </Tooltip>
          )}
        </div>
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <NavLink
            to="/loopie"
            className={({ isActive }) =>
              cn(
                "rounded-md px-3 py-1.5 transition hover:text-foreground lg:hidden",
                isActive ? "bg-muted text-foreground" : undefined,
              )
            }
          >
            Loopie
          </NavLink>
          <NavLink
            to="/"
            className={({ isActive }) =>
              cn(
                "rounded-md px-3 py-1.5 transition hover:text-foreground",
                isActive ? "bg-muted text-foreground" : undefined,
              )
            }
          >
            Journal
          </NavLink>
          {onOpenSettings ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className="rounded-md px-3 py-1.5 text-left transition hover:text-foreground"
            >
              Settings
            </button>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
