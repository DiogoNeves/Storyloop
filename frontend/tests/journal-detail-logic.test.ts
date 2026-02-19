import { describe, expect, it } from "vitest";

import {
  buildPromptMarkdown,
  deriveSaveIndicator,
  isEffectivelyEmptyNoteContent,
} from "@/lib/journal-detail-logic";
import { parseValidDate } from "@/lib/date-time";

describe("journal-detail-logic", () => {
  it("parses valid dates and rejects invalid ones", () => {
    expect(parseValidDate("2025-02-01T10:00:00Z")).toBeInstanceOf(Date);
    expect(parseValidDate("not-a-date")).toBeNull();
    expect(parseValidDate(null)).toBeNull();
  });

  it("builds prompt markdown with fallback format text", () => {
    expect(buildPromptMarkdown("Focus on hooks", null)).toContain(
      "No format guidance yet.",
    );
  });

  it("derives save indicator for queued state with pending update", () => {
    const indicator = deriveSaveIndicator("queued", null, true);
    expect(indicator.show).toBe(true);
    expect(indicator.message).toBe("Saved locally, syncing soon.");
  });

  it("detects placeholder-only note content as empty", () => {
    expect(isEffectivelyEmptyNoteContent("")).toBe(true);
    expect(isEffectivelyEmptyNoteContent("   ")).toBe(true);
    expect(isEffectivelyEmptyNoteContent("<br />")).toBe(true);
    expect(isEffectivelyEmptyNoteContent("<br/><br>")).toBe(true);
    expect(isEffectivelyEmptyNoteContent("&nbsp;\u200b")).toBe(true);
    expect(isEffectivelyEmptyNoteContent("actual note")).toBe(false);
  });
});
