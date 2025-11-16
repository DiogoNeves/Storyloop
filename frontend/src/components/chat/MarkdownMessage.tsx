import {
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type TableHTMLAttributes,
  useMemo,
} from "react";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

interface MarkdownMessageProps {
  content: string;
  className?: string;
  tone?: "default" | "user";
}

const getTextColorClasses = (tone: MarkdownMessageProps["tone"]) =>
  tone === "user" ? "text-primary-foreground/95" : "text-foreground/90";

const getHeadingColor = (tone: MarkdownMessageProps["tone"]) =>
  tone === "user" ? "text-primary-foreground" : "text-foreground";

const normalizeClassName = (value: unknown) =>
  typeof value === "string" ? value : undefined;

type MarkdownCodeProps = HTMLAttributes<HTMLElement> & {
  inline?: boolean;
  node?: unknown;
};

const createMarkdownComponents = (
  tone: MarkdownMessageProps["tone"] = "default",
) => {
  const textColor = getTextColorClasses(tone);
  const headingColor = getHeadingColor(tone);

  // Base markdown component mapping. Extend this map with custom components
  // (e.g., callouts or rich link previews) to evolve the chat rendering
  // without changing the consumer components.
  const components = {
    h1: ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
      <h1
        className={cn(
          "mt-6 text-xl font-semibold tracking-tight first:mt-0",
          headingColor,
          normalizeClassName(className),
        )}
        {...props}
      />
    ),
    h2: ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
      <h2
        className={cn(
          "mt-5 text-lg font-semibold tracking-tight first:mt-0",
          headingColor,
          normalizeClassName(className),
        )}
        {...props}
      />
    ),
    h3: ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
      <h3
        className={cn(
          "mt-4 text-base font-semibold tracking-tight first:mt-0",
          headingColor,
          normalizeClassName(className),
        )}
        {...props}
      />
    ),
    p: ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
      <p
        className={cn(
          "mb-4 leading-7 last:mb-0",
          textColor,
          normalizeClassName(className),
        )}
        {...props}
      />
    ),
    ul: ({ className, ...props }: HTMLAttributes<HTMLUListElement>) => (
      <ul
        className={cn(
          "mb-4 ml-4 list-disc space-y-2 last:mb-0",
          textColor,
          normalizeClassName(className),
        )}
        {...props}
      />
    ),
    ol: ({ className, ...props }: HTMLAttributes<HTMLOListElement>) => (
      <ol
        className={cn(
          "mb-4 ml-4 list-decimal space-y-2 last:mb-0",
          textColor,
          normalizeClassName(className),
        )}
        {...props}
      />
    ),
    li: ({ className, ...props }: HTMLAttributes<HTMLLIElement>) => (
      <li
        className={cn("leading-7", textColor, normalizeClassName(className))}
        {...props}
      />
    ),
    a: ({ className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a
        className={cn(
          "text-primary underline-offset-4 transition-colors hover:underline",
          textColor,
          normalizeClassName(className),
        )}
        target="_blank"
        rel="noreferrer"
        {...props}
      />
    ),
    blockquote: ({
      className,
      ...props
    }: HTMLAttributes<HTMLQuoteElement>) => (
      <blockquote
        className={cn(
          "mb-4 mt-2 border-l-2 border-primary/40 bg-primary/5 px-4 py-3 italic last:mb-0",
          textColor,
          normalizeClassName(className),
        )}
        {...props}
      />
    ),
    code: ({ inline, className, children, ...props }: MarkdownCodeProps) => {
      if (inline) {
        return (
          <code
            className={cn(
              "rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]",
              textColor,
              normalizeClassName(className),
            )}
            {...props}
          >
            {children}
          </code>
        );
      }

      const { node, ...rest } = props;
      void node;

      return (
        <pre
          className={cn(
            "mb-4 mt-2 overflow-x-auto rounded-xl bg-muted/70 px-4 py-3 text-sm shadow-inner",
            textColor,
          )}
        >
          <code
            className={cn(
              "block min-w-max font-mono",
              normalizeClassName(className),
            )}
            {...rest}
          >
            {children}
          </code>
        </pre>
      );
    },
    table: ({
      className,
      children,
      ...props
    }: TableHTMLAttributes<HTMLTableElement>) => (
      <div className="my-4 overflow-x-auto rounded-xl border border-border/60">
        <table
          className={cn(
            "w-full border-collapse text-sm",
            textColor,
            normalizeClassName(className),
          )}
          {...props}
        >
          {children}
        </table>
      </div>
    ),
    thead: ({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) => (
      <thead
        className={cn("bg-muted/60", textColor, normalizeClassName(className))}
        {...props}
      />
    ),
    th: ({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) => (
      <th
        className={cn(
          "border-b border-border/60 px-3 py-2 text-left font-semibold",
          textColor,
          normalizeClassName(className),
        )}
        {...props}
      />
    ),
    tbody: ({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) => (
      <tbody
        className={cn(
          "divide-y divide-border/60",
          textColor,
          normalizeClassName(className),
        )}
        {...props}
      />
    ),
    tr: ({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) => (
      <tr className={cn("even:bg-muted/20", normalizeClassName(className))} {...props} />
    ),
    td: ({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) => (
      <td
        className={cn(
          "px-3 py-2 align-top",
          textColor,
          normalizeClassName(className),
        )}
        {...props}
      />
    ),
  } satisfies Components;

  return components;
};

export function MarkdownMessage({
  content,
  className,
  tone = "default",
}: MarkdownMessageProps) {
  const textColor = getTextColorClasses(tone);
  const markdownComponents = useMemo(
    () => createMarkdownComponents(tone),
    [tone],
  );

  return (
    <div
      className={cn("markdown-message text-sm leading-relaxed", textColor, className)}
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
