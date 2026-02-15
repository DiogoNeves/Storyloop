import { describe, expect, it } from "vitest";

import { shouldSkipInitialMarkdownUpdate } from "@/lib/editor-markdown-update";

describe("editor-markdown-update", () => {
  it("skips the first markdown update when it mirrors the initial value", () => {
    expect(
      shouldSkipInitialMarkdownUpdate({
        hasSeenFirstMarkdownUpdate: false,
        initialValue: "Existing content",
        nextMarkdown: "Existing content",
      }),
    ).toBe(true);
  });

  it("does not skip the first markdown update when it is a real edit", () => {
    expect(
      shouldSkipInitialMarkdownUpdate({
        hasSeenFirstMarkdownUpdate: false,
        initialValue: "Existing content",
        nextMarkdown: "",
      }),
    ).toBe(false);
  });

  it("never skips updates after the first event", () => {
    expect(
      shouldSkipInitialMarkdownUpdate({
        hasSeenFirstMarkdownUpdate: true,
        initialValue: "Existing content",
        nextMarkdown: "Existing content",
      }),
    ).toBe(false);
  });
});
