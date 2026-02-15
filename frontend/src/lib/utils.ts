import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function pluralize(
  word: string,
  count: number,
  pluralForm = `${word}s`,
) {
  return count === 1 ? word : pluralForm
}
