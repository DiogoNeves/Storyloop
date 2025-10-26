import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(
  ...inputs: (string | undefined | null | false)[]
): string {
  return twMerge(clsx(inputs))
}

