import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { App } from "@/App";

vi.mock("@/lib/api", () => ({
  fetchHealth: vi.fn().mockResolvedValue({ status: "Storyloop API ready" }),
}));

describe("App", () => {
  it("renders the dashboard hero and health status", async () => {
    render(<App />);

    expect(
      screen.getByText(/Storyloop \| Content journal/i),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText(/Storyloop API ready/i)).toBeInTheDocument(),
    );
  });
});
