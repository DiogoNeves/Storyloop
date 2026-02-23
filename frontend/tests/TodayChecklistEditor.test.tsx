import { useState, type ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { TodayChecklistEditor } from "@/components/TodayChecklistEditor";
import type { ActivityItem } from "@/lib/types/entries";

interface TodayChecklistEditorHarnessProps {
  initialValue?: string;
  moveCompletedTasksToEnd?: boolean;
  mentionableItems?: ActivityItem[];
}

function TodayChecklistEditorHarness({
  initialValue = "- [ ]",
  moveCompletedTasksToEnd = true,
  mentionableItems = [],
}: TodayChecklistEditorHarnessProps) {
  const [value, setValue] = useState(initialValue);

  return (
    <TodayChecklistEditor
      value={value}
      onChange={setValue}
      moveCompletedTasksToEnd={moveCompletedTasksToEnd}
      mentionableItems={mentionableItems}
    />
  );
}

function TodayChecklistExternalUpdateHarness() {
  const [value, setValue] = useState("- [ ] Plan intro\n- [ ] Write script");

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setValue("- [ ] External update task");
        }}
      >
        Apply external update
      </button>
      <TodayChecklistEditor value={value} onChange={setValue} mentionableItems={[]} />
    </div>
  );
}

const mentionableItems: ActivityItem[] = [
  {
    id: "journal-1",
    title: "Sprint recap",
    summary: "Summary",
    date: "2026-02-20T10:00:00.000Z",
    category: "journal",
    pinned: true,
    archived: false,
  },
  {
    id: "journal-2",
    title: "Video about Simile",
    summary: "Summary",
    date: "2026-02-19T10:00:00.000Z",
    category: "journal",
    pinned: false,
    archived: false,
  },
  {
    id: "journal-3",
    title: "Launch notes",
    summary: "Summary",
    date: "2026-02-18T10:00:00.000Z",
    category: "journal",
    pinned: false,
    archived: false,
  },
  {
    id: "journal-4",
    title: "Older note",
    summary: "Summary",
    date: "2026-02-17T10:00:00.000Z",
    category: "journal",
    pinned: false,
    archived: false,
  },
  {
    id: "today-2026-02-20",
    title: "Today",
    summary: "- [ ] not included",
    date: "2026-02-20T12:00:00.000Z",
    category: "today",
    pinned: false,
    archived: false,
  },
  {
    id: "video-1",
    title: "Not a journal entry",
    summary: "Summary",
    date: "2026-02-16T10:00:00.000Z",
    category: "content",
    pinned: false,
    archived: false,
  },
];

function renderWithRouter(ui: ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("TodayChecklistEditor", () => {
  it("keeps a single row while typing and preserves spaces", async () => {
    renderWithRouter(<TodayChecklistEditorHarness />);

    const input = screen.getByPlaceholderText("Type a task…");
    await userEvent.type(input, "This is a test");

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(input).toHaveValue("This is a test");
  });

  it("adds rows only on Enter or with the add-task button", async () => {
    renderWithRouter(<TodayChecklistEditorHarness />);

    const input = screen.getByPlaceholderText("Type a task…");
    await userEvent.type(input, "Plan video");
    await userEvent.keyboard("{Enter}");

    expect(screen.getAllByRole("textbox")).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: "Add task row" }));

    expect(screen.getAllByRole("textbox")).toHaveLength(3);
  });

  it("normalizes pasted newlines into a single checklist row", async () => {
    renderWithRouter(<TodayChecklistEditorHarness />);

    const input = screen.getByPlaceholderText("Type a task…");
    await userEvent.click(input);
    await userEvent.paste("Draft hook\nCTA options");

    expect(input).toHaveValue("Draft hook CTA options");
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("moves a newly completed task to the end by default", async () => {
    renderWithRouter(
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
    renderWithRouter(
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
    renderWithRouter(
      <TodayChecklistEditorHarness
        initialValue="- [ ] Draft hook #Focus #archived"
      />,
    );

    const focusTag = screen.getByText("#focus");
    const archivedTag = screen.getByText("#archived");

    expect(focusTag).toHaveClass("rounded-full");
    expect(archivedTag).toHaveClass(
      "rounded-full",
      "bg-primary/15",
      "text-primary",
    );
  });

  it("shows delete controls while focused and hides confirmation when focus leaves", async () => {
    renderWithRouter(
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
    renderWithRouter(
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
    renderWithRouter(
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

  it("applies external updates after leaving the delete button", async () => {
    renderWithRouter(<TodayChecklistExternalUpdateHarness />);

    await userEvent.click(screen.getAllByRole("textbox")[0]);
    await userEvent.click(screen.getByRole("button", { name: "Delete task 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Apply external update" }));

    await waitFor(() => {
      const inputs = screen.getAllByRole("textbox");
      expect(inputs).toHaveLength(1);
      expect(inputs[0]).toHaveValue("External update task");
    });
  });

  it("shows the latest three journal suggestions when typing only @", async () => {
    renderWithRouter(<TodayChecklistEditorHarness mentionableItems={mentionableItems} />);

    const input = screen.getByPlaceholderText("Type a task…");
    await userEvent.click(input);
    await userEvent.type(input, "@");

    expect(await screen.findByRole("button", { name: "Sprint recap" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Video about Simile" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Launch notes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Older note" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Not a journal entry" })).toBeNull();
  });

  it("attaches a mention as a clickable reference chip without showing raw token text", async () => {
    renderWithRouter(<TodayChecklistEditorHarness mentionableItems={mentionableItems} />);

    const input = screen.getByPlaceholderText("Type a task…");
    await userEvent.click(input);
    await userEvent.type(input, "@spr");
    await userEvent.click(await screen.findByRole("button", { name: "Sprint recap" }));

    expect(input).toHaveValue("");
    expect(screen.queryByDisplayValue("@entry:journal-1")).toBeNull();
    const referenceChip = await screen.findByRole("link", { name: "Sprint recap" });
    expect(referenceChip).toHaveAttribute("href", "/journals/journal-1");
  });

  it("uses Enter to select a mention before adding a new row", async () => {
    renderWithRouter(<TodayChecklistEditorHarness mentionableItems={mentionableItems} />);

    const input = screen.getByPlaceholderText("Type a task…");
    await userEvent.click(input);
    await userEvent.type(input, "@spr");
    await userEvent.keyboard("{Enter}");

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(input).toHaveValue("");
    expect(await screen.findByRole("link", { name: "Sprint recap" })).toBeInTheDocument();

    await userEvent.keyboard("{Enter}");
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
  });

  it("cycles mention selection with arrow keys", async () => {
    renderWithRouter(<TodayChecklistEditorHarness mentionableItems={mentionableItems} />);

    const input = screen.getByPlaceholderText("Type a task…");
    await userEvent.click(input);
    await userEvent.type(input, "@");
    await screen.findByRole("button", { name: "Sprint recap" });

    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Enter}");

    expect(input).toHaveValue("");
    expect(await screen.findByRole("link", { name: "Video about Simile" })).toBeInTheDocument();
  });

  it("closes mention suggestions with Escape and keeps normal Enter behavior", async () => {
    renderWithRouter(<TodayChecklistEditorHarness mentionableItems={mentionableItems} />);

    const input = screen.getByPlaceholderText("Type a task…");
    await userEvent.click(input);
    await userEvent.type(input, "@spr");
    await screen.findByRole("button", { name: "Sprint recap" });

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Sprint recap" })).toBeNull();

    await userEvent.keyboard("{Enter}");
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
  });
});
