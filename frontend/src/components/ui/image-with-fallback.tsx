import { useState, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface ImageWithFallbackProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  /** Image source URL. If falsy, renders fallback. */
  src: string | null | undefined;
  /** Content to render when src is missing or image fails to load. */
  fallback?: React.ReactNode;
  /** Show a loading placeholder while image loads. */
  showLoadingState?: boolean;
}

/**
 * Image component with built-in fallback and loading state handling.
 *
 * Renders nothing (or fallback) if src is falsy.
 * Shows a loading shimmer while the image loads (if showLoadingState is true).
 * Falls back to fallback content if the image fails to load.
 */
export function ImageWithFallback({
  src,
  alt,
  fallback,
  className,
  showLoadingState = false,
  ...props
}: ImageWithFallbackProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return fallback ? <>{fallback}</> : null;
  }

  return (
    <>
      {showLoadingState && isLoading ? (
        <div
          className={cn("absolute inset-0 animate-pulse bg-muted", className)}
          aria-hidden="true"
        />
      ) : null}
      <img
        src={src}
        alt={alt}
        className={cn(
          showLoadingState && isLoading ? "opacity-0" : "opacity-100",
          "transition-opacity duration-200",
          className
        )}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
        {...props}
      />
    </>
  );
}
