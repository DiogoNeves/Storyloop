import { describe, expect, it } from "vitest";

import { findMentionCandidate, findMentionStateAtCursor } from "@/lib/mention-search";

describe("findMentionCandidate", () => {
  it("returns null when no @ appears", () => {
    expect(findMentionCandidate("hello there")).toBeNull();
  });

  it("captures an empty query after @", () => {
    expect(findMentionCandidate("Hello @")).toEqual({
      query: "",
      startIndex: 6,
    });
  });

  it("captures the query until whitespace", () => {
    expect(findMentionCandidate("Hello @Loopie")).toEqual({
      query: "Loopie",
      startIndex: 6,
    });
  });

  it("returns null once whitespace follows the mention", () => {
    expect(findMentionCandidate("Hello @Loopie ")).toBeNull();
  });

  it("reactivates after whitespace is removed", () => {
    expect(findMentionCandidate("Hello @Loopie ")).toBeNull();
    expect(findMentionCandidate("Hello @Loopie")).toEqual({
      query: "Loopie",
      startIndex: 6,
    });
  });

  it("ignores @ characters in the middle of words", () => {
    expect(findMentionCandidate("email@test.com")).toBeNull();
  });
});

describe("findMentionStateAtCursor", () => {
  it("returns null when cursor is unavailable", () => {
    expect(findMentionStateAtCursor("hello @note", null)).toBeNull();
  });

  it("returns mention boundaries for the active cursor position", () => {
    expect(findMentionStateAtCursor("hello @note", 11)).toEqual({
      query: "note",
      startIndex: 6,
      endIndex: 11,
    });
  });
});
