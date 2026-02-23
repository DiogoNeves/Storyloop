import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SmartEntryDraftCard } from "@/components/SmartEntryDraftCard";
import type { ActivityDraft } from "@/components/ActivityFeed";

const baseDraft: ActivityDraft = {
  title: "",
  summary: "",
  date: "2026-02-23T09:00",
  promptBody: "",
  promptFormat: "",
  mode: "smart",
};

function setViewportMatch(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => {
      const noop = () => undefined;
      return {
        matches: query === "(max-width: 768px)" ? matches : false,
        media: query,
        onchange: null,
        addListener: noop,
        removeListener: noop,
        addEventListener: noop,
        removeEventListener: noop,
        dispatchEvent: () => false,
      };
    },
  });
}

describe("SmartEntryDraftCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("scrolls the create card into view on focus for mobile viewport", () => {
    setViewportMatch(true);
    const scrollIntoViewMock = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock,
    });

    render(<SmartEntryDraftCard draft={baseDraft} onChange={vi.fn()} />);

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(scrollIntoViewMock).toHaveBeenCalled();
  });

  it("does not auto-scroll for desktop viewport", () => {
    setViewportMatch(false);
    const scrollIntoViewMock = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock,
    });

    render(<SmartEntryDraftCard draft={baseDraft} onChange={vi.fn()} />);

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });
});
