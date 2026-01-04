import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface StatusMessageProps {
  type: "error" | "info" | "success" | "warning";
  message: ReactNode;
  className?: string;
}

const typeStyles: Record<StatusMessageProps["type"], string> = {
  error: "text-destructive",
  warning: "text-amber-600 dark:text-amber-500",
  info: "text-muted-foreground",
  success: "text-green-600 dark:text-green-500",
};

/**
 * Displays a status message with appropriate styling based on type.
 * Renders nothing if message is falsy.
 */
export function StatusMessage({ type, message, className }: StatusMessageProps) {
  if (!message) {
    return null;
  }

  return (
    <p
      className={cn("text-sm", typeStyles[type], className)}
      role={type === "error" ? "alert" : "status"}
    >
      {message}
    </p>
  );
}
