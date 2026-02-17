import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { TodayChecklistEditor } from "@/components/TodayChecklistEditor";

function TodayChecklistEditorHarness() {
  const [value, setValue] = useState("- [ ]");

  return <TodayChecklistEditor value={value} onChange={setValue} />;
}

describe("TodayChecklistEditor", () => {
  it("keeps a single row while typing and preserves spaces", async () => {
    render(<TodayChecklistEditorHarness />);

    const input = screen.getByPlaceholderText("Type a task…");
    await userEvent.type(input, "This is a test");

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(input).toHaveValue("This is a test");
  });

  it("adds rows only on Enter or with the add-task button", async () => {
    render(<TodayChecklistEditorHarness />);

    const input = screen.getByPlaceholderText("Type a task…");
    await userEvent.type(input, "Plan video");
    await userEvent.keyboard("{Enter}");

    expect(screen.getAllByRole("textbox")).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: "Add task row" }));

    expect(screen.getAllByRole("textbox")).toHaveLength(3);
  });

  it("sanitizes pasted line breaks while keeping a single wrapped row", async () => {
    render(<TodayChecklistEditorHarness />);

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText("Type a task…");
    await user.click(input);
    fireEvent.change(input, {
      target: { value: "Plan intro\nShip video" },
    });
    await user.tab();

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByRole("textbox")).toHaveValue("Plan intro Ship video");
  });
});
