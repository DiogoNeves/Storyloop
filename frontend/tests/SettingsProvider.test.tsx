import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsProvider } from "@/context/SettingsProvider";
import { useSettings } from "@/context/useSettings";
import type { SettingsResponse } from "@/api/settings";

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

function SettingsProbe() {
  const {
    accentPreference,
    setAccentPreference,
    isAccentUpdating,
    accentUpdateError,
  } = useSettings();

  return (
    <div>
      <div data-testid="accent">{accentPreference}</div>
      <div data-testid="is-updating">{String(isAccentUpdating)}</div>
      <div data-testid="error">{accentUpdateError ?? ""}</div>
      <button type="button" onClick={() => setAccentPreference("azure")}>
        Switch accent
      </button>
    </div>
  );
}

function renderProvider() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <SettingsProbe />
      </SettingsProvider>
    </QueryClientProvider>,
  );
}

describe("SettingsProvider accent preference", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiPutMock.mockReset();
    localStorage.clear();
    document.documentElement.removeAttribute("data-accent");
    document.documentElement.classList.remove("dark");
  });

  it("applies accent preference from backend settings to the document root", async () => {
    apiGetMock.mockResolvedValue({
      data: {
        ...baseSettings,
        accentColor: "emerald",
      } satisfies SettingsResponse,
    });

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("accent")).toHaveTextContent("emerald"),
    );
    expect(document.documentElement.dataset.accent).toBe("emerald");
  });

  it("optimistically updates and rolls back when accent update fails", async () => {
    apiGetMock.mockResolvedValue({ data: baseSettings });
    apiPutMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject: (error: Error) => void) => {
          setTimeout(() => reject(new Error("failed to save")), 40);
        }),
    );

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("accent")).toHaveTextContent("crimson"),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Switch accent/i }));

    await waitFor(() =>
      expect(screen.getByTestId("accent")).toHaveTextContent("azure"),
    );

    await waitFor(() =>
      expect(apiPutMock).toHaveBeenCalledWith("/settings", {
        accentColor: "azure",
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("error")).toHaveTextContent(
        "We couldn't update the accent color. Try again.",
      ),
    );

    expect(screen.getByTestId("accent")).toHaveTextContent("crimson");
    expect(document.documentElement.dataset.accent).toBe("crimson");
  });
});
