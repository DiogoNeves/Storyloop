import { describe, expect, it } from "vitest";

import { appendTranscribedText } from "@/lib/dictation";

describe("appendTranscribedText", () => {
  it("returns transcript when existing text is empty", () => {
    expect(appendTranscribedText("", "  hello world  ")).toBe("hello world");
  });

  it("appends transcript with a spacer when needed", () => {
    expect(appendTranscribedText("Existing", "new words")).toBe(
      "Existing new words",
    );
  });

  it("does not add duplicate spacer when existing text already ends with whitespace", () => {
    expect(appendTranscribedText("Existing ", "new words")).toBe(
      "Existing new words",
    );
  });

  it("keeps existing text when transcript is empty", () => {
    expect(appendTranscribedText("Existing", "   ")).toBe("Existing");
  });
});
