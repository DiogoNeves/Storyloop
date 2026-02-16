import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TagFilterSection } from "@/components/TagFilterSection";
import type { ActivityItem } from "@/lib/types/entries";

const items: ActivityItem[] = [
  {
    id: "journal-1",
    title: "Journal",
    summary: "Testing #shared #journalonly",
    date: "2025-01-01T00:00:00.000Z",
    category: "journal",
    tags: ["shared", "journalonly"],
  },
  {
    id: "video-1",
    title: "Video",
    summary: "Testing #shared #videoonly",
    date: "2025-01-02T00:00:00.000Z",
    category: "content",
    tags: ["shared", "videoonly"],
  },
  {
    id: "video-2",
    title: "Video 2",
    summary: "Testing #videoextra",
    date: "2025-01-02T12:00:00.000Z",
    category: "content",
    tags: ["videoextra"],
  },
  {
    id: "conversation-1",
    title: "Conversation",
    summary: "Testing #conversationonly",
    date: "2025-01-03T00:00:00.000Z",
    category: "conversation",
    tags: ["conversationonly"],
  },
];

describe("TagFilterSection", () => {
  it("starts video tags collapsed and expands on demand", async () => {
    const onTagToggle = vi.fn();
    const onClearTags = vi.fn();
    const user = userEvent.setup();

    render(
      <TagFilterSection
        items={items}
        activeTags={[]}
        onTagToggle={onTagToggle}
        onClearTags={onClearTags}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^tags$/i }));

    expect(screen.getByText("In Journals")).toBeInTheDocument();
    expect(screen.getByText("In Videos")).toBeInTheDocument();
    expect(screen.getByText("In Conversations")).toBeInTheDocument();

    expect(screen.getByText("#journalonly")).toBeInTheDocument();
    expect(screen.queryByText("#videoonly")).not.toBeInTheDocument();
    expect(screen.getByText("#conversationonly")).toBeInTheDocument();
    expect(screen.getAllByText("#shared")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /show tags/i }));

    expect(screen.getByText("#videoonly")).toBeInTheDocument();
  });

  it("allows collapsing with multiple selected video tags and shows selected count", async () => {
    const onTagToggle = vi.fn();
    const onClearTags = vi.fn();
    const user = userEvent.setup();

    render(
      <TagFilterSection
        items={items}
        activeTags={["videoonly", "videoextra", "shared"]}
        onTagToggle={onTagToggle}
        onClearTags={onClearTags}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^tags$/i }));

    expect(screen.getByRole("button", { name: /show tags/i })).toBeInTheDocument();
    expect(screen.getByText("2 tags selected")).toBeInTheDocument();
    expect(screen.queryByText("#videoonly")).not.toBeInTheDocument();
    expect(screen.queryByText("#videoextra")).not.toBeInTheDocument();
    expect(screen.getAllByText("#shared")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /show tags/i }));

    expect(screen.getByRole("button", { name: /hide tags/i })).toBeInTheDocument();
    expect(screen.getByText("#videoonly")).toBeInTheDocument();
    expect(screen.getByText("#videoextra")).toBeInTheDocument();
    expect(screen.getAllByText("#shared")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /hide tags/i }));

    expect(screen.getByText("2 tags selected")).toBeInTheDocument();
    expect(screen.queryByText("#videoonly")).not.toBeInTheDocument();
    expect(screen.queryByText("#videoextra")).not.toBeInTheDocument();
    expect(screen.getAllByText("#shared")).toHaveLength(1);
  });
});
