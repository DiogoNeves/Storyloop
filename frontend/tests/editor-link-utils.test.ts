import { describe, expect, it } from "vitest";

import { findClosestLinkElement } from "@/lib/editor-link-utils";

describe("findClosestLinkElement", () => {
  it("returns the anchor when given a text node inside a link", () => {
    const container = document.createElement("div");
    container.innerHTML = '<a href="https://example.com">example</a>';
    const link = container.querySelector("a");
    const textNode = link?.firstChild;

    expect(textNode).not.toBeNull();
    expect(findClosestLinkElement(textNode ?? null)).toBe(link);
  });

  it("returns null when the node is not inside a link", () => {
    const container = document.createElement("div");
    container.innerHTML = "<span>example</span>";
    const textNode = container.querySelector("span")?.firstChild;

    expect(findClosestLinkElement(textNode ?? null)).toBeNull();
  });
});
