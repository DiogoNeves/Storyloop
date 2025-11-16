import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

// Base markdown component mapping. Extend this map with custom components (e.g.,
// callouts or rich link previews) to evolve the chat rendering without changing
// the consumer components.
const markdownComponents: Components = {
  h1: ({ className, ...props }) => (
    <h1
      className={cn(
        "mt-6 text-xl font-semibold tracking-tight text-foreground first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      className={cn(
        "mt-5 text-lg font-semibold tracking-tight text-foreground first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      className={cn(
        "mt-4 text-base font-semibold tracking-tight text-foreground first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  p: ({ className, ...props }) => (
    <p
      className={cn(
        "mb-4 leading-7 text-foreground/90 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn(
        "mb-4 ml-4 list-disc space-y-2 text-foreground/90 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn(
        "mb-4 ml-4 list-decimal space-y-2 text-foreground/90 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  li: ({ className, ...props }) => (
    <li className={cn("leading-7", className)} {...props} />
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn(
        "text-primary underline-offset-4 transition-colors hover:underline",
        className,
      )}
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn(
        "mb-4 mt-2 border-l-2 border-primary/40 bg-primary/5 px-4 py-3 text-foreground/90 italic last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  code: ({ inline, className, children, ...props }) => {
    if (inline) {
      return (
        <code
          className={cn(
            "rounded bg-muted px-1.5 py-0.5 font-mono text-[13px] text-foreground/90",
            className,
          )}
          {...props}
        >
          {children}
        </code>
      );
    }

    return (
      <pre
        className="mb-4 mt-2 overflow-x-auto rounded-xl bg-muted/70 px-4 py-3 text-sm text-foreground shadow-inner"
        {...props}
      >
        <code className={cn("block min-w-max font-mono", className)}>
          {children}
        </code>
      </pre>
    );
  },
  table: ({ className, children, ...props }) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-border/60">
      <table
        className={cn("w-full border-collapse text-sm", className)}
        {...props}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ className, ...props }) => (
    <thead className={cn("bg-muted/60", className)} {...props} />
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        "border-b border-border/60 px-3 py-2 text-left font-semibold text-foreground",
        className,
      )}
      {...props}
    />
  ),
  tbody: ({ className, ...props }) => (
    <tbody className={cn("divide-y divide-border/60", className)} {...props} />
  ),
  tr: ({ className, ...props }) => (
    <tr className={cn("even:bg-muted/20", className)} {...props} />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn(
        "px-3 py-2 align-top text-foreground/90",
        className,
      )}
      {...props}
    />
  ),
};

export function MarkdownMessage({ content, className }: MarkdownMessageProps) {
  return (
    <div
      className={cn(
        "markdown-message text-sm leading-relaxed text-foreground/90",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
        skipHtml
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
