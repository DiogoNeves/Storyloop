import { Children, memo, useMemo, type HTMLAttributes } from "react";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  buildPreviewMarkdownSource,
  hasLikelyMarkdownSyntax,
  isMarkdownPreviewCategory,
} from "@/lib/activity-markdown-preview";
import type { ActivityItem } from "@/lib/types/entries";
import { cn } from "@/lib/utils";

interface ActivityMarkdownPreviewProps {
  text: string;
  category: ActivityItem["category"];
  showPlaceholderPulse?: boolean;
}

type MarkdownCodeProps = HTMLAttributes<HTMLElement> & {
  inline?: boolean;
  node?: unknown;
};

const MARKDOWN_PREVIEW_COMPONENTS: Components = {
  h1: ({ children }) => <span className="font-medium">{children} </span>,
  h2: ({ children }) => <span className="font-medium">{children} </span>,
  h3: ({ children }) => <span className="font-medium">{children} </span>,
  h4: ({ children }) => <span className="font-medium">{children} </span>,
  h5: ({ children }) => <span className="font-medium">{children} </span>,
  h6: ({ children }) => <span className="font-medium">{children} </span>,
  p: ({ children }) => <span>{children} </span>,
  strong: ({ children }) => <strong>{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  del: ({ children }) => <del>{children}</del>,
  ul: ({ children }) => <span>{children}</span>,
  ol: ({ children }) => <span>{children}</span>,
  li: ({ children }) => <span>&bull; {children} </span>,
  blockquote: ({ children }) => <span>{children} </span>,
  a: ({ children }) => (
    <span className="underline decoration-primary/60 underline-offset-2">
      {children}
    </span>
  ),
  code: ({ inline, children, ...props }: MarkdownCodeProps) => {
    const codeText = Children.toArray(children)
      .map((child) =>
        typeof child === "string" || typeof child === "number"
          ? String(child)
          : "",
      )
      .join("");
    if (!inline && codeText.includes("\n")) {
      return null;
    }

    const { node, ...rest } = props;
    void node;

    return (
      <code
        className="rounded bg-muted px-1 py-0.5 font-mono text-[12px] text-foreground/90"
        {...rest}
      >
        {children}
      </code>
    );
  },
  pre: () => null,
  img: () => null,
  table: () => null,
  thead: () => null,
  tbody: () => null,
  tr: () => null,
  th: () => null,
  td: () => null,
  hr: () => null,
};

const previewBodyClassName = "line-clamp-3 text-sm leading-6 text-muted-foreground";

function ActivityMarkdownPreviewComponent({
  text,
  category,
  showPlaceholderPulse = false,
}: ActivityMarkdownPreviewProps) {
  const previewSource = useMemo(() => buildPreviewMarkdownSource(text), [text]);
  const shouldRenderMarkdown = useMemo(
    () =>
      isMarkdownPreviewCategory(category) &&
      hasLikelyMarkdownSyntax(previewSource),
    [category, previewSource],
  );

  if (previewSource.length === 0) {
    return null;
  }

  return (
    <div
      className="flex min-w-0 items-start gap-2"
      data-testid="activity-preview-body"
    >
      {showPlaceholderPulse ? (
        <span
          className="mt-2 h-2 w-2 shrink-0 animate-ping rounded-full bg-primary"
          aria-hidden="true"
        />
      ) : null}
      {shouldRenderMarkdown ? (
        <div className={cn("min-w-0 flex-1", previewBodyClassName)}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={MARKDOWN_PREVIEW_COMPONENTS}
            skipHtml
          >
            {previewSource}
          </ReactMarkdown>
        </div>
      ) : (
        <p
          className={cn("min-w-0 flex-1 whitespace-pre-line", previewBodyClassName)}
        >
          {previewSource}
        </p>
      )}
    </div>
  );
}

export const ActivityMarkdownPreview = memo(ActivityMarkdownPreviewComponent);
