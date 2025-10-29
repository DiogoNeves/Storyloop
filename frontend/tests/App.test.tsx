import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { App } from "@/App";

const mockEntries = [
  {
    id: "entry-1",
    title: "Latest entry",
    summary: "Captured retention improvements.",
    date: new Date().toISOString(),
    category: "journal" as const,
    linkUrl: null,
    thumbnailUrl: null,
  },
];

vi.mock("@/api/entries", () => ({
  entriesQueries: {
    all: () => ({
      queryKey: ["entries"],
      queryFn: vi.fn().mockResolvedValue(mockEntries),
    }),
    byId: vi.fn(),
  },
  createEntry: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/api/health", () => ({
  healthQueries: {
    status: () => ({
      queryKey: ["health"],
      queryFn: vi.fn().mockResolvedValue({ status: "Storyloop API ready" }),
    }),
  },
}));

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

    await waitFor(() =>
      expect(screen.getByText(/Captured retention improvements\./i)).toBeInTheDocument(),
    );
  });
});
