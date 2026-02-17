import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { JournalEntryEditor } from "@/components/JournalEntryEditor";

const LINK_URL = "https://github.com/DiogoNeves/pelagia";

describe("JournalEntryEditor link tooltip regression", () => {
  it("shows Open/Edit when clicking link text and closes on outside click", async () => {
    render(
      <JournalEntryEditor
        initialValue={`[Open Pelagia](${LINK_URL})`}
        resetKey="link-tooltip-regression"
        onChange={vi.fn()}
        isEditable
      />,
    );

    const link = await waitFor(() => {
      const anchor = document.querySelector<HTMLAnchorElement>(
        `a[href="${LINK_URL}"]`,
      );
      if (!anchor) {
        throw new Error("Link not rendered yet");
      }
      return anchor;
    });

    const textNode = Array.from(link.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE,
    );
    expect(textNode).toBeTruthy();

    act(() => {
      textNode?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    });

    act(() => {
      fireEvent.mouseDown(document.body);
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Open" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Edit" }),
      ).not.toBeInTheDocument();
    });
  });
});
