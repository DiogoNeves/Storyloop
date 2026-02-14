import { describe, expect, it } from "vitest";

import {
  formatDateTimeLocalInput,
  formatLongDateTime,
  parseValidDate,
} from "@/lib/date-time";

describe("date-time", () => {
  it("parses valid and invalid date values", () => {
    expect(parseValidDate("2025-02-01T10:00:00Z")).toBeInstanceOf(Date);
    expect(parseValidDate("invalid")).toBeNull();
  });

  it("formats long date-time when a value is present", () => {
    const formatted = formatLongDateTime(new Date("2025-02-01T10:00:00Z"));
    expect(typeof formatted).toBe("string");
    expect(formatted?.length).toBeGreaterThan(0);
  });

  it("formats local input values at minute precision", () => {
    const value = formatDateTimeLocalInput(
      new Date("2025-02-01T10:45:59.123Z"),
    );
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
