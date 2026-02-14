import { describe, expect, it } from "vitest";

import { findTagCandidate, findTagCompletion } from "@/lib/tag-completion";

describe("findTagCompletion", () => {
  it("returns the longest common completion suffix across matching tags", () => {
    expect(findTagCompletion("ret", ["retention", "retest"])).toBe("e");
    expect(findTagCompletion("str", ["strategy", "streaming", "thumbnail"])).toBeNull();
  });

  it("returns null when there is no useful completion", () => {
    expect(findTagCompletion("archived", ["archived"])).toBeNull();
    expect(findTagCompletion("x", ["retention", "thumbnail"])).toBeNull();
  });
});

describe("findTagCandidate", () => {
  it("extracts hashtag candidate directly before the cursor", () => {
    expect(findTagCandidate("hello #ret", 5, 15)).toEqual({
      from: 12,
      to: 15,
      query: "ret",
    });
  });

  it("returns null when the cursor is no longer in a hashtag token", () => {
    expect(findTagCandidate("hello #ret ", 0, 11)).toBeNull();
  });
});
