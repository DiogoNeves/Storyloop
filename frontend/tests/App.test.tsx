import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { App } from "@/App";
import type { CreateEntryInput, Entry, UpdateEntryInput } from "@/api/entries";

const mockEntries = vi.hoisted<Entry[]>(() => [
  {
    id: "entry-001",
    title: "Published the season premiere",
    summary: "Story-focused cold open lifted AVD to 71% in the first 48 hours.",
    date: "2024-05-12T15:30:00.000Z",
    updatedAt: "2024-05-12T15:30:00.000Z",
    category: "content" as const,
    linkUrl: "https://youtube.com/watch?v=storyloop-premiere",
    thumbnailUrl: "https://img.youtube.com/storyloop-premiere/hqdefault.jpg",
    videoId: "storyloop-premiere",
    pinned: false,
    lastSmartUpdateAt: null,
  },
  {
    id: "entry-002",
    title: "Audience feedback: hero alignment",
    summary: "Comments highlight appreciation for behind-the-scenes vulnerability.",
    date: "2024-05-10T18:05:00.000Z",
    updatedAt: "2024-05-10T18:05:00.000Z",
    category: "journal",
    linkUrl: null,
    thumbnailUrl: null,
    pinned: true,
    lastSmartUpdateAt: null,
  },
]);

vi.mock("@/api/entries", () => {
  const cloneEntries = (entries: Entry[]): Entry[] =>
    entries.map((entry) => ({ ...entry }));

  function listEntriesImpl(): Promise<Entry[]> {
    return Promise.resolve(cloneEntries(mockEntries));
  }

  function findEntryByIdImpl(id: string): Promise<Entry | undefined> {
    return Promise.resolve(mockEntries.find((entry) => entry.id === id));
  }

  function createEntryImpl(input: CreateEntryInput): Promise<Entry> {
    return Promise.resolve({
      ...input,
      linkUrl: input.linkUrl ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
      pinned: input.pinned ?? false,
      updatedAt: input.date,
      lastSmartUpdateAt: null,
    });
  }

  function updateEntryImpl(input: UpdateEntryInput): Promise<Entry> {
    const existing = mockEntries.find((entry) => entry.id === input.id);
    if (!existing) {
      throw new Error(`Entry ${input.id} not found`);
    }
    return Promise.resolve({
      ...existing,
      ...input,
    });
  }

  function deleteEntryImpl(id: string): Promise<void> {
    void id;
    return Promise.resolve();
  }

  const listEntries = vi.fn(listEntriesImpl);
  const findEntryById = vi.fn(findEntryByIdImpl);
  const createEntry = vi.fn(createEntryImpl);
  const updateEntry = vi.fn(updateEntryImpl);
  const deleteEntry = vi.fn(deleteEntryImpl);

  return {
    entriesQueries: {
      all: () => ({
        queryKey: ["entries"],
        queryFn: listEntries,
      }),
      byId: (id: string) => ({
        queryKey: ["entries", id],
        queryFn: () => findEntryById(id),
      }),
    },
    createEntry,
    updateEntry,
    deleteEntry,
    entriesMutations: {
      create: () => ({
        mutationFn: createEntry,
      }),
      update: () => ({
        mutationFn: updateEntry,
      }),
      delete: () => ({
        mutationFn: deleteEntry,
      }),
    },
  };
});

describe("App", () => {
  it("renders the dashboard with mock entries", async () => {
    render(<App />);

    expect(
      screen.getByRole("button", { name: /\+ entry/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^Channel$/i }),
    ).not.toBeInTheDocument();

    await waitFor(() =>
      expect(
        screen.getByText(/Published the season premiere/i),
      ).toBeInTheDocument(),
    );
  });
});
