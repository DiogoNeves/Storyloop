import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { App } from "@/App";

const mockEntries = vi.hoisted(() => [
  {
    id: "entry-001",
    title: "Published the season premiere",
    summary: "Story-focused cold open lifted AVD to 71% in the first 48 hours.",
    date: "2024-05-12T15:30:00.000Z",
    category: "video" as const,
    linkUrl: "https://youtube.com/watch?v=storyloop-premiere",
    thumbnailUrl: "https://img.youtube.com/storyloop-premiere/hqdefault.jpg",
  },
  {
    id: "entry-002",
    title: "Audience insight: hero alignment",
    summary: "Comments highlight appreciation for behind-the-scenes vulnerability.",
    date: "2024-05-10T18:05:00.000Z",
    category: "insight" as const,
    linkUrl: null,
    thumbnailUrl: null,
  },
]);

vi.mock("@/api/health", () => ({
  healthQueries: {
    status: () => ({
      queryKey: ["health"],
      queryFn: vi.fn().mockResolvedValue({ status: "Storyloop API ready" }),
    }),
  },
}));

vi.mock("@/api/entries", () => {
  const listEntries = vi.fn(async () => mockEntries.map((entry) => ({ ...entry })));

  return {
    entriesQueries: {
      all: () => ({
        queryKey: ["entries"],
        queryFn: listEntries,
      }),
    },
    createEntry: vi.fn(async (input) => ({
      ...input,
      linkUrl: input.linkUrl ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
    })),
  };
});

describe("App", () => {
  it("renders the dashboard and health status", async () => {
    render(<App />);

    expect(screen.getByText(/Storyloop Score/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /\+ entry/i }),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText(/Storyloop API ready/i)).toBeInTheDocument(),
    );
  });
});
