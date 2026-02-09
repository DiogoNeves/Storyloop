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
    id: "conversation-1",
    title: "Conversation",
    summary: "Testing #conversationonly",
    date: "2025-01-03T00:00:00.000Z",
    category: "conversation",
    tags: ["conversationonly"],
  },
];

describe("TagFilterSection", () => {
  it("groups tags by source and de-duplicates shared tags to journals", async () => {
    const onTagSelect = vi.fn();
    const user = userEvent.setup();

    render(
      <TagFilterSection
        items={items}
        activeTag={null}
        onTagSelect={onTagSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: /tags/i }));

    expect(screen.getByText("In Journals")).toBeInTheDocument();
    expect(screen.getByText("In Videos")).toBeInTheDocument();
    expect(screen.getByText("In Conversations")).toBeInTheDocument();

    expect(screen.getByText("#journalonly")).toBeInTheDocument();
    expect(screen.getByText("#videoonly")).toBeInTheDocument();
    expect(screen.getByText("#conversationonly")).toBeInTheDocument();
    expect(screen.getAllByText("#shared")).toHaveLength(1);
  });
});
