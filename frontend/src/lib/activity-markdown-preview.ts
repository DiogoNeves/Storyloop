import type { ActivityItem } from "@/lib/types/entries";

const DEFAULT_MAX_PREVIEW_CHARS = 900;

const MARKDOWN_SYNTAX_PATTERN =
  /(^|\n)\s{0,3}(#{1,6}\s|>\s|[-*+]\s|\d+\.\s)|`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\[[^\]]+]\([^)]+\)|!\[[^\]]*]\([^)]+\)/;

export function isMarkdownPreviewCategory(
  category: ActivityItem["category"],
): boolean {
  return category === "journal" || category === "conversation";
}

export function hasLikelyMarkdownSyntax(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return MARKDOWN_SYNTAX_PATTERN.test(trimmed);
}

export function buildPreviewMarkdownSource(
  text: string,
  maxChars = DEFAULT_MAX_PREVIEW_CHARS,
): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return "";
  }

  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxChars).trimEnd()}…`;
}
