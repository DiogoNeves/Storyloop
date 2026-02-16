import { describe, expect, it } from "vitest";

import {
  buildPreviewMarkdownSource,
  hasLikelyMarkdownSyntax,
  isMarkdownPreviewCategory,
} from "@/lib/activity-markdown-preview";

describe("activity-markdown-preview", () => {
  it("enables markdown preview for journal, today, and conversation categories", () => {
    expect(isMarkdownPreviewCategory("journal")).toBe(true);
    expect(isMarkdownPreviewCategory("today")).toBe(true);
    expect(isMarkdownPreviewCategory("conversation")).toBe(true);
    expect(isMarkdownPreviewCategory("content")).toBe(false);
  });

  it("detects likely markdown syntax with a lightweight heuristic", () => {
    expect(hasLikelyMarkdownSyntax("Some **bold** text")).toBe(true);
    expect(hasLikelyMarkdownSyntax("1. Ordered list item")).toBe(true);
    expect(hasLikelyMarkdownSyntax("Plain text with #hashtag only")).toBe(false);
  });

  it("caps markdown source length and appends an ellipsis", () => {
    const longText = "x".repeat(20);
    expect(buildPreviewMarkdownSource(longText, 10)).toBe("xxxxxxxxxx…");
  });

  it("returns empty source for empty or whitespace-only input", () => {
    expect(buildPreviewMarkdownSource("")).toBe("");
    expect(buildPreviewMarkdownSource("   \n\t")).toBe("");
  });
});
