import { cn } from "@/lib/utils";

interface VoiceReactiveOverlayProps {
  active: boolean;
  inputLevel: number;
  tone?: "primary" | "destructive";
  className?: string;
}

const MIN_OPACITY = 0.5;
const OPACITY_RANGE = 0.4;

export function VoiceReactiveOverlay({
  active,
  inputLevel,
  tone = "primary",
  className,
}: VoiceReactiveOverlayProps) {
  const clampedLevel = Number.isFinite(inputLevel)
    ? Math.min(Math.max(inputLevel, 0), 1)
    : 0;
  const opacity = active ? MIN_OPACITY + clampedLevel * OPACITY_RANGE : 0;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 transition-opacity duration-75",
        tone === "destructive" ? "bg-destructive" : "bg-primary",
        className,
      )}
      style={{ opacity }}
    />
  );
}
