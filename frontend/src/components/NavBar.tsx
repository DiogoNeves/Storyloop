import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

interface NavBarProps {
  onOpenSettings?: () => void;
}

export function NavBar({ onOpenSettings }: NavBarProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full items-center justify-between px-6 lg:px-10 xl:px-16">
        <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="rounded-md bg-primary px-2 py-1 text-primary-foreground sm:hidden">
            S
          </span>
          <span className="hidden rounded-md bg-primary px-2 py-1 text-primary-foreground sm:inline">
            Storyloop
          </span>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            Content journal
          </span>
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
