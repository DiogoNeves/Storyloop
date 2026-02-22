import { describe, expect, it } from "vitest";

import {
  extractEntryReferenceIds,
  extractEntryReferenceTokens,
  replaceEntryReferenceTokensWithMarkdownLinks,
} from "@/lib/entry-references";

describe("entry-references", () => {
  it("extracts multiple canonical tokens in order", () => {
    const text =
      "Use @entry:entry-1 now.\nThen compare @entry:entry-2 for context.";
    expect(extractEntryReferenceTokens(text)).toEqual([
      {
        entryId: "entry-1",
        token: "@entry:entry-1",
        start: 4,
        end: 18,
      },
      {
        entryId: "entry-2",
        token: "@entry:entry-2",
        start: 37,
        end: 51,
      },
    ]);
    expect(extractEntryReferenceIds(text)).toEqual(["entry-1", "entry-2"]);
  });

  it("deduplicates ids while keeping first-seen order", () => {
    expect(
      extractEntryReferenceIds("Check @entry:abc then @entry:abc and @entry:def"),
    ).toEqual(["abc", "def"]);
  });

  it("ignores malformed tokens and tokens inside words", () => {
    const text =
      "bad@entry:abc @entry: valid @entry:-x okay @entry:abc_1, done.";
    expect(extractEntryReferenceTokens(text)).toEqual([
      {
        entryId: "abc_1",
        token: "@entry:abc_1",
        start: 43,
        end: 55,
      },
    ]);
  });

  it("supports manually typed canonical tokens", () => {
    expect(extractEntryReferenceIds("@entry:entry-123")).toEqual([
      "entry-123",
    ]);
  });

  it("replaces canonical tokens with markdown links", () => {
    const text = "Revisit @entry:entry-1 and maybe @entry:missing.";
    const markdown = replaceEntryReferenceTokensWithMarkdownLinks(text, {
      "entry-1": "My Journal Entry",
    });
    expect(markdown).toBe(
      "Revisit [My Journal Entry](/entryref/entry-1) and maybe [Entry missing](/entryref/missing).",
    );
  });
});
