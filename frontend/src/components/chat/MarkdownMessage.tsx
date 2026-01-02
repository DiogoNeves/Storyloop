import {
  Children,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type TableHTMLAttributes,
  useMemo,
} from "react";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router-dom";

import { AssetLinkCard } from "@/components/chat/AssetLinkCard";
import { getAssetId, isAssetPath, resolveAssetUrl } from "@/lib/assets";
import { cn } from "@/lib/utils";
import { getToneColors, resolveTone, type ChatTone } from "./toneStyles";

interface MarkdownMessageProps {
  content: string;
  className?: string;
  tone?: ChatTone;
}

const normalizeClassName = (value: unknown) =>
  typeof value === "string" ? value : undefined;

type MarkdownCodeProps = HTMLAttributes<HTMLElement> & {
  inline?: boolean;
  node?: unknown;
};

const createMarkdownComponents = (tone: ChatTone) => {
  const { heading, text: textColor } = getToneColors(tone);

  // Base markdown component mapping. Extend this map with custom components
  // (e.g., callouts or rich link previews) to evolve the chat rendering
  // without changing the consumer components.
  const components = {
    h1: ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
      <h1
        className={cn(
          "mt-6 text-xl font-semibold tracking-tight first:mt-0",
          heading,
          normalizeClassName(className),
        )}
        {...props}
      />
    ),
    h2: ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
      <h2
        className={cn(
          "mt-5 text-lg font-semibold tracking-tight first:mt-0",
          heading,
          normalizeClassName(className),
        )}
        {...props}
      />
    ),
    h3: ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
      <h3
        className={cn(
          "mt-4 text-base font-semibold tracking-tight first:mt-0",
          heading,
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
    ul: ({ className, ...props }: HTMLAttributes<HTMLUListElement>) => {
      const isTaskList =
        normalizeClassName(className)?.includes("contains-task-list");

      return (
        <ul
          className={cn(
            "mb-4 ml-4 space-y-2 last:mb-0",
            isTaskList ? "list-none pl-0" : "list-disc",
            textColor,
            normalizeClassName(className),
          )}
          {...props}
        />
      );
    },
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
        className={cn(
          "leading-7",
          normalizeClassName(className)?.includes("task-list-item")
            ? "list-none"
            : undefined,
          textColor,
          normalizeClassName(className),
        )}
        {...props}
      />
    ),
    a: ({
      className,
      href,
      children,
      ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement>) => {
      const linkClassName = cn(
        "text-primary underline underline-offset-4 transition-colors",
        textColor,
        normalizeClassName(className),
      );

      if (href && isAssetPath(href)) {
        const assetId = getAssetId(href);
        if (assetId) {
          const label = Children.toArray(children)
            .map((child) => (typeof child === "string" ? child : ""))
            .join("")
            .trim();
          return (
            <AssetLinkCard
              assetId={assetId}
              href={href}
              label={label.length > 0 ? label : undefined}
            />
          );
        }
      }

      // Use Link for relative/internal links, regular anchor for external
      if (href?.startsWith("/")) {
        return (
          <Link to={href} className={linkClassName} {...props}>
            {children}
          </Link>
        );
      }

      return (
        <a
          href={href}
          className={linkClassName}
          target="_blank"
          rel="noreferrer"
          {...props}
        >
          {children}
        </a>
      );
    },
    img: ({ className, src, alt, ...props }) => {
      if (!src) {
        return null;
      }
      const resolvedSrc = resolveAssetUrl(src);
      return (
        <img
          src={resolvedSrc}
          alt={alt ?? ""}
          loading="lazy"
          className={cn(
            "my-3 max-h-[360px] w-full rounded-xl border border-border/60 object-cover",
            normalizeClassName(className),
          )}
          {...props}
        />
      );
    },
    blockquote: ({ className, ...props }: HTMLAttributes<HTMLQuoteElement>) => (
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
    thead: ({
      className,
      ...props
    }: HTMLAttributes<HTMLTableSectionElement>) => (
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
    tbody: ({
      className,
      ...props
    }: HTMLAttributes<HTMLTableSectionElement>) => (
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
      <tr
        className={cn("even:bg-muted/20", normalizeClassName(className))}
        {...props}
      />
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
  tone = "assistant",
}: MarkdownMessageProps) {
  const resolvedTone = resolveTone(tone);
  const { text: textColor } = getToneColors(resolvedTone);
  const markdownComponents = useMemo(
    () => createMarkdownComponents(resolvedTone),
    [resolvedTone],
  );

  return (
    <div
      className={cn(
        "markdown-message text-sm leading-relaxed",
        textColor,
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
