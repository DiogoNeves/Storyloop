import { useEffect, useRef, useState } from "react";
import { Check, Clipboard } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface CopyMarkdownButtonProps {
  getContent: () => string;
  disabled?: boolean;
  label?: string;
  title?: string;
}

const COPY_RESET_MS = 1500;

export function CopyMarkdownButton({
  getContent,
  disabled = false,
  label = "Copy markdown",
  title,
}: CopyMarkdownButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    if (disabled) {
      return;
    }
    const content = getContent();
    try {
      await copyToClipboard(content);
      setCopied(true);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => {
        setCopied(false);
      }, COPY_RESET_MS);
    } catch {
      // Ignore clipboard failures to avoid blocking UI.
    }
  };

  const accessibleLabel = copied ? "Copied markdown" : label;
  const buttonTitle = copied ? "Copied" : title ?? label;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => {
        void handleCopy();
      }}
      disabled={disabled}
      aria-label={accessibleLabel}
      title={buttonTitle}
      className={cn("text-muted-foreground", copied && "text-primary")}
    >
      {copied ? (
        <Check className="h-4 w-4" />
      ) : (
        <Clipboard className="h-4 w-4" />
      )}
    </Button>
  );
}

const copyToClipboard = async (text: string) => {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard unavailable");
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const success = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!success) {
    throw new Error("Copy failed");
  }
};
