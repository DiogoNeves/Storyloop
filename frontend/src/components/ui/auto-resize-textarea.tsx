import * as React from "react";
import TextareaAutosize from "react-textarea-autosize";

import { cn } from "@/lib/utils";

export type AutoResizeTextareaProps = React.ComponentPropsWithoutRef<
  typeof TextareaAutosize
>;

const AutoResizeTextarea = React.forwardRef<
  HTMLTextAreaElement,
  AutoResizeTextareaProps
>(({ className, minRows = 1, maxRows, ...props }, ref) => {
  return (
    <TextareaAutosize
      minRows={minRows}
      maxRows={maxRows}
      className={cn(
        "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});

AutoResizeTextarea.displayName = "AutoResizeTextarea";

export { AutoResizeTextarea };
