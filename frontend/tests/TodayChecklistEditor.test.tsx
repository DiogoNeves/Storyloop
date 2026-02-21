import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { TodayChecklistEditor } from "@/components/TodayChecklistEditor";

interface TodayChecklistEditorHarnessProps {
  initialValue?: string;
  moveCompletedTasksToEnd?: boolean;
}

function TodayChecklistEditorHarness({
  initialValue = "- [ ]",
  moveCompletedTasksToEnd = true,
}: TodayChecklistEditorHarnessProps) {
  const [value, setValue] = useState(initialValue);

  return (
    <TodayChecklistEditor
      value={value}
      onChange={setValue}
      moveCompletedTasksToEnd={moveCompletedTasksToEnd}
    />
  );
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

  it("normalizes pasted newlines into a single checklist row", async () => {
    render(<TodayChecklistEditorHarness />);

    const input = screen.getByPlaceholderText("Type a task…");
    await userEvent.click(input);
    await userEvent.paste("Draft hook\nCTA options");

    expect(input).toHaveValue("Draft hook CTA options");
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("moves a newly completed task to the end by default", async () => {
    render(
      <TodayChecklistEditorHarness
        initialValue={"- [ ] Plan intro\n- [ ] Write script\n- [ ] Publish"}
      />,
    );

    await userEvent.click(screen.getAllByRole("checkbox")[0]);

    const inputs = screen.getAllByRole("textbox");
    expect(inputs[0]).toHaveValue("Write script");
    expect(inputs[1]).toHaveValue("Publish");
    expect(inputs[2]).toHaveValue("Plan intro");
    expect(screen.getAllByRole("checkbox")[2]).toBeChecked();
  });

  it("keeps checklist order when moveCompletedTasksToEnd is disabled", async () => {
    render(
      <TodayChecklistEditorHarness
        initialValue={"- [ ] Plan intro\n- [ ] Write script\n- [ ] Publish"}
        moveCompletedTasksToEnd={false}
      />,
    );

    await userEvent.click(screen.getAllByRole("checkbox")[0]);

    const inputs = screen.getAllByRole("textbox");
    expect(inputs[0]).toHaveValue("Plan intro");
    expect(inputs[1]).toHaveValue("Write script");
    expect(inputs[2]).toHaveValue("Publish");
    expect(screen.getAllByRole("checkbox")[0]).toBeChecked();
  });

  it("renders task hashtags as tag bubbles", () => {
    render(
      <TodayChecklistEditorHarness
        initialValue="- [ ] Draft hook #Focus #archived"
      />,
    );

    const focusTag = screen.getByText("#focus");
    const archivedTag = screen.getByText("#archived");

    expect(focusTag).toHaveClass("rounded-full");
    expect(archivedTag).toHaveClass("rounded-full", "bg-red-100", "text-red-700");
  });

  it("shows delete controls while focused and hides confirmation when focus leaves", async () => {
    render(
      <TodayChecklistEditorHarness
        initialValue={"- [ ] Plan intro\n- [ ] Write script"}
      />,
    );

    expect(screen.queryByRole("button", { name: "Delete task 1" })).toBeNull();

    const firstTaskInput = screen.getAllByRole("textbox")[0];
    await userEvent.click(firstTaskInput);

    await userEvent.click(screen.getByRole("button", { name: "Delete task 1" }));
    expect(screen.getByRole("button", { name: "Confirm delete task 1" })).toBeInTheDocument();

    const secondTaskInput = screen.getAllByRole("textbox")[1];
    await userEvent.click(secondTaskInput);

    expect(screen.queryByRole("button", { name: "Confirm delete task 1" })).toBeNull();
  });


  it("deletes the originally selected task after rows reorder", async () => {
    render(
      <TodayChecklistEditorHarness
        initialValue={"- [ ] Plan intro\n- [ ] Write script\n- [ ] Publish"}
      />,
    );

    await userEvent.click(screen.getAllByRole("textbox")[0]);
    await userEvent.click(screen.getByRole("button", { name: "Delete task 1" }));

    await userEvent.click(screen.getAllByRole("checkbox")[0]);

    await userEvent.click(
      screen.getByRole("button", { name: "Confirm delete task 3" }),
    );

    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toHaveValue("Write script");
    expect(inputs[1]).toHaveValue("Publish");
  });

  it("deletes a task after confirmation", async () => {
    render(
      <TodayChecklistEditorHarness
        initialValue={"- [ ] Plan intro\n- [ ] Write script\n- [ ] Publish"}
      />,
    );

    const firstTaskInput = screen.getAllByRole("textbox")[0];
    await userEvent.click(firstTaskInput);

    await userEvent.click(screen.getByRole("button", { name: "Delete task 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm delete task 1" }));

    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toHaveValue("Write script");
    expect(inputs[1]).toHaveValue("Publish");
  });
});
