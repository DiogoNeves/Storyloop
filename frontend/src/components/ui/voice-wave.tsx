import { useCallback, useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

interface VoiceWaveProps {
  active: boolean;
  inputLevel: number;
  className?: string;
}

const BAR_WIDTH = 2;
const BAR_GAP = 2;
const BASELINE_LEVEL = 0.04;

export function VoiceWave({ active, inputLevel, className }: VoiceWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<number[]>([]);
  const latestLevelRef = useRef(inputLevel);
  const activeRef = useRef(active);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.floor(rect.width * dpr));
    const pixelHeight = Math.max(1, Math.floor(rect.height * dpr));

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const barStride = (BAR_WIDTH + BAR_GAP) * dpr;
    const barWidth = BAR_WIDTH * dpr;
    const barCount = Math.max(
      18,
      Math.floor((pixelWidth + BAR_GAP * dpr) / barStride),
    );

    if (activeRef.current) {
      historyRef.current.push(latestLevelRef.current);
      if (historyRef.current.length > barCount) {
        historyRef.current.splice(0, historyRef.current.length - barCount);
      }
    } else {
      historyRef.current = [];
    }

    const style = window.getComputedStyle(canvas);
    const resolvedColor = style.color || "rgb(255, 255, 255)";

    ctx.clearRect(0, 0, pixelWidth, pixelHeight);
    ctx.fillStyle = resolvedColor;

    const minBarHeight = Math.max(1 * dpr, pixelHeight * 0.12);
    const maxBarHeight = pixelHeight * 0.95;
    const center = (barCount - 1) / 2;

    for (let index = 0; index < barCount; index += 1) {
      const historyIndex = historyRef.current.length - barCount + index;
      const sample =
        historyIndex >= 0 ? historyRef.current[historyIndex] : BASELINE_LEVEL;

      const clamped = Math.max(Math.min(sample, 1), 0);
      const distanceFromCenter = Math.abs(index - center) / Math.max(center, 1);
      const centerEnvelope = 1 - distanceFromCenter * 0.22;
      const texture = 0.55 + 0.45 * Math.abs(Math.sin(index * 0.47 + 0.8));
      const intensity = Math.max(clamped * texture * centerEnvelope, BASELINE_LEVEL);
      const barHeight = minBarHeight + intensity * (maxBarHeight - minBarHeight);

      const x = index * barStride;
      const y = (pixelHeight - barHeight) / 2;
      ctx.globalAlpha = 0.25 + intensity * 0.75;
      ctx.fillRect(x, y, barWidth, barHeight);
    }

    ctx.globalAlpha = 1;
  }, []);

  useEffect(() => {
    latestLevelRef.current = inputLevel;
    activeRef.current = active;
    draw();
  }, [active, draw, inputLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      draw();
    });
    resizeObserver.observe(canvas);
    return () => {
      resizeObserver.disconnect();
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("h-6 w-full text-foreground/90", className)}
      aria-hidden="true"
    />
  );
}
