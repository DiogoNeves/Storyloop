import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsDialog } from "@/components/SettingsDialog";
import { SettingsProvider } from "@/context/SettingsProvider";
import type {
  SettingsResponse,
  UpdateSettingsInput,
} from "@/api/settings";

const apiGetMock = vi.hoisted(() => vi.fn());
const apiPutMock = vi.hoisted(() => vi.fn());

vi.mock("@/api/client", () => ({
  apiClient: {
    get: apiGetMock,
    put: apiPutMock,
  },
  API_BASE_URL: "http://localhost:8000",
}));

const baseSettings: SettingsResponse = {
  smartUpdateScheduleHours: 24,
  showArchived: false,
  activityFeedSortDate: "created",
  todayEntriesEnabled: true,
  todayIncludePreviousIncomplete: true,
  todayMoveCompletedToEnd: true,
  accentColor: "crimson",
};

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <SettingsDialog open onOpenChange={vi.fn()} />
      </SettingsProvider>
    </QueryClientProvider>,
  );
}

describe("SettingsDialog accent picker", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiPutMock.mockReset();

    apiGetMock.mockImplementation((url: string) => {
      if (url === "/settings") {
        return Promise.resolve({ data: baseSettings });
      }
      if (url === "/youtube/auth/status") {
        return Promise.resolve({
          data: {
            linked: false,
            refreshNeeded: false,
            channel: null,
            statusMessage: null,
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    apiPutMock.mockImplementation(
      (_url: string, payload: UpdateSettingsInput) => {
        return Promise.resolve({
          data: {
            ...baseSettings,
            ...payload,
          } satisfies SettingsResponse,
        });
      },
    );
  });

  it("renders all accent options and persists the selected accent", async () => {
    renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "General" }));

    const accentTrigger = await screen.findByLabelText("Accent color");
    await user.click(accentTrigger);

    const expectedOptions = ["Crimson", "Rose", "Emerald", "Azure", "Violet"];
    for (const option of expectedOptions) {
      expect(await screen.findByRole("option", { name: option })).toBeInTheDocument();
    }

    await user.click(screen.getByRole("option", { name: "Violet" }));

    await waitFor(() =>
      expect(apiPutMock).toHaveBeenCalledWith("/settings", {
        accentColor: "violet",
      }),
    );
  });

  it("keeps settings controls reachable when switching tabs", async () => {
    renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Journal" }));
    expect(await screen.findByText("Show public uploads only")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Smart update schedule in hours"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(await screen.findByLabelText("Enable Today entries")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Include previous incomplete tasks"),
    ).toBeInTheDocument();
  });
});
