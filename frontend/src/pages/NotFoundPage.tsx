import { Link, useLocation } from "react-router-dom";

export function NotFoundPage() {
  const location = useLocation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <section className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Error 404
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          The story is missing
        </h1>

        <pre className="mt-6 overflow-x-auto rounded-xl border border-border bg-muted p-4 font-mono text-sm leading-relaxed text-foreground sm:text-base">
{`    __________________________
   /  STORYBOOK             /|
  /________________________/ |
  | once upon a time...    | |
  | chapter: [ MISSING ]   | |
  |________________________|/
          ||      ||
          ||      ||
          \\\\__..__//
`}
        </pre>

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
          We looked for{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground sm:text-sm">
            {location.pathname}
          </code>{" "}
          but this chapter does not exist. Head back to continue your main
          storyline.
        </p>

        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Back to dashboard
          </Link>
        </div>
      </section>
    </div>
  );
}
