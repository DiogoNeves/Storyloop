import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

export function NavBar() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="rounded-md bg-primary px-2 py-1 text-primary-foreground">
            Storyloop
          </span>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            Content journal
          </span>
        </div>
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
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
          <NavLink
            to="/insights"
            className={({ isActive }) =>
              cn(
                "rounded-md px-3 py-1.5 transition hover:text-foreground",
                isActive ? "bg-muted text-foreground" : undefined,
              )
            }
          >
            Insights
          </NavLink>
          <a href="#" className="rounded-md px-3 py-1.5 transition hover:text-foreground">
            Library
          </a>
          <a href="#" className="rounded-md px-3 py-1.5 transition hover:text-foreground">
            Settings
          </a>
        </nav>
      </div>
    </header>
  );
}
