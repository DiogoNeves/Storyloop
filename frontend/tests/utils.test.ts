import { describe, expect, it } from "vitest";

import { pluralize } from "@/lib/utils";

describe("pluralize", () => {
  it("returns singular for count 1", () => {
    expect(pluralize("tag", 1)).toBe("tag");
  });

  it("returns plural for counts other than 1", () => {
    expect(pluralize("tag", 0)).toBe("tags");
    expect(pluralize("tag", 2)).toBe("tags");
  });

  it("supports custom plural forms", () => {
    expect(pluralize("entry", 2, "entries")).toBe("entries");
  });
});
