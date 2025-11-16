import { NavLink } from "react-router-dom";

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
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `font-medium transition-colors hover:text-foreground ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`
            }
          >
            Journal
          </NavLink>
          <NavLink
            to="/insights"
            className={({ isActive }) =>
              `font-medium transition-colors hover:text-foreground ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`
            }
          >
            Insights
          </NavLink>
          <span className="hover:text-foreground">Library</span>
          <span className="hover:text-foreground">Settings</span>
        </nav>
      </div>
    </header>
  );
}
