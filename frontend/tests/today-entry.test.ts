import { describe, expect, it } from "vitest";

import {
  buildTodayChecklistMarkdownFromTasks,
  extractDayKeyFromTodayEntryId,
  extractIncompleteTasksFromTodayMarkdown,
  getTodayEntryDisplayTitle,
  getTodayEntryIdForDate,
  getUtcDayKey,
  isTodayChecklistEmpty,
  normalizeTodayChecklistMarkdown,
  parseTodayChecklistMarkdown,
  serializeTodayChecklistRows,
} from "@/lib/today-entry";

describe("today-entry helpers", () => {
  it("parses and serializes checklist markdown", () => {
    const rows = parseTodayChecklistMarkdown("- [ ] Plan intro\n- [x] Publish");

    expect(rows).toEqual([
      { text: "Plan intro", checked: false },
      { text: "Publish", checked: true },
    ]);
    expect(serializeTodayChecklistRows(rows)).toBe(
      "- [ ] Plan intro\n- [x] Publish",
    );
  });

  it("normalizes markdown with a trailing empty row", () => {
    expect(normalizeTodayChecklistMarkdown("- [ ] Plan intro")).toBe(
      "- [ ] Plan intro\n- [ ]",
    );
  });

  it("builds deterministic UTC day keys and ids", () => {
    const date = new Date("2026-02-16T23:00:00.000Z");
    expect(getUtcDayKey(date)).toBe("2026-02-16");
    expect(getTodayEntryIdForDate(date)).toBe("today-2026-02-16");
    expect(extractDayKeyFromTodayEntryId("today-2026-02-16")).toBe(
      "2026-02-16",
    );
    expect(extractDayKeyFromTodayEntryId("journal-1")).toBeNull();
  });

  it("extracts incomplete tasks and rebuilds canonical markdown", () => {
    const tasks = extractIncompleteTasksFromTodayMarkdown(
      "- [ ] Plan intro\n- [x] Publish\n- [ ]",
    );
    expect(tasks).toEqual(["Plan intro"]);
    expect(buildTodayChecklistMarkdownFromTasks(tasks)).toBe(
      "- [ ] Plan intro\n- [ ]",
    );
  });

  it("returns Today for current-day entries and date labels for past entries", () => {
    const now = new Date("2026-02-16T10:00:00.000Z");

    expect(
      getTodayEntryDisplayTitle("today-2026-02-16", now.toISOString(), now),
    ).toBe("Today");
    expect(
      getTodayEntryDisplayTitle("today-2026-02-15", now.toISOString(), now),
    ).toMatch(/2026|Feb/i);
  });

  it("detects empty today checklists", () => {
    expect(isTodayChecklistEmpty("- [ ]")).toBe(true);
    expect(isTodayChecklistEmpty("- [ ]\n- [ ]")).toBe(true);
    expect(isTodayChecklistEmpty("")).toBe(true);
    expect(isTodayChecklistEmpty("- [ ] Plan intro\n- [ ]")).toBe(false);
    expect(isTodayChecklistEmpty("- [x] Done\n- [ ]")).toBe(false);
  });

  it("formats past Today labels using UTC day boundaries", () => {
    const now = new Date("2026-02-16T10:00:00.000Z");
    const expected = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date("2026-02-15T00:00:00.000Z"));

    expect(
      getTodayEntryDisplayTitle("today-2026-02-15", now.toISOString(), now),
    ).toBe(expected);
  });
});
