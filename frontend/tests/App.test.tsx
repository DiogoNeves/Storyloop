import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { App } from "@/App";

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
  });
});
