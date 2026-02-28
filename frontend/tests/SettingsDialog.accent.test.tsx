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
const apiPostMock = vi.hoisted(() => vi.fn());

vi.mock("@/api/client", () => ({
  apiClient: {
    get: apiGetMock,
    put: apiPutMock,
    post: apiPostMock,
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
  openaiKeyConfigured: false,
  ollamaBaseUrl: "http://127.0.0.1:11434",
  activeModel: "openai",
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
    apiPostMock.mockReset();

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
      if (url === "/settings/export") {
        return Promise.resolve({
          data: new Blob(["zip-bytes"], { type: "application/zip" }),
          headers: {
            "content-disposition":
              'attachment; filename="storyloop-export-2026-02-25.zip"',
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    apiPutMock.mockImplementation(
      (_url: string, payload: UpdateSettingsInput) => {
        const openaiConfigured =
          payload.openaiApiKey !== undefined
            ? Boolean(payload.openaiApiKey?.trim())
            : baseSettings.openaiKeyConfigured;
        return Promise.resolve({
          data: {
            ...baseSettings,
            smartUpdateScheduleHours:
              payload.smartUpdateScheduleHours ??
              baseSettings.smartUpdateScheduleHours,
            showArchived: payload.showArchived ?? baseSettings.showArchived,
            activityFeedSortDate:
              payload.activityFeedSortDate ?? baseSettings.activityFeedSortDate,
            todayEntriesEnabled:
              payload.todayEntriesEnabled ?? baseSettings.todayEntriesEnabled,
            todayIncludePreviousIncomplete:
              payload.todayIncludePreviousIncomplete ??
              baseSettings.todayIncludePreviousIncomplete,
            todayMoveCompletedToEnd:
              payload.todayMoveCompletedToEnd ??
              baseSettings.todayMoveCompletedToEnd,
            accentColor: payload.accentColor ?? baseSettings.accentColor,
            ollamaBaseUrl: payload.ollamaBaseUrl ?? baseSettings.ollamaBaseUrl,
            activeModel: payload.activeModel ?? baseSettings.activeModel,
            openaiKeyConfigured: openaiConfigured,
          } satisfies SettingsResponse,
        });
      },
    );

    apiPostMock.mockImplementation((url: string) => {
      if (url === "/settings/ollama/connect") {
        return Promise.resolve({
          data: {
            ollamaBaseUrl: "http://127.0.0.1:11434",
            models: ["qwen3:8b", "llama3.2"],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it("renders all accent options and persists the selected accent", async () => {
    renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "General" }));

    const accentTrigger = await screen.findByLabelText("Accent color");
    await user.click(accentTrigger);

    const expectedOptions = ["Crimson", "Rose", "Emerald", "Azure", "Violet"];
    await screen.findByRole("option", { name: expectedOptions[0] });
    for (const option of expectedOptions) {
      expect(screen.getByRole("option", { name: option })).toBeInTheDocument();
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

  it("exports account content as a zip download", async () => {
    const createObjectUrlMock = vi.fn(() => "blob:storyloop-export");
    const revokeObjectUrlMock = vi.fn();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrlMock,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrlMock,
    });

    try {
      renderDialog();
      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: "Export data" }));

      await waitFor(() =>
        expect(apiGetMock).toHaveBeenCalledWith("/settings/export", {
          responseType: "blob",
        }),
      );

      await waitFor(() => {
        expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(revokeObjectUrlMock).toHaveBeenCalledWith(
          "blob:storyloop-export",
        );
      });
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectURL,
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: originalRevokeObjectURL,
      });
      clickSpy.mockRestore();
    }
  });

  it("saves OpenAI API key from model settings", async () => {
    renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "General" }));
    const keyInput = await screen.findByLabelText("OpenAI API key");
    await user.type(keyInput, "sk-test");
    await user.click(screen.getByRole("button", { name: "Save key" }));

    await waitFor(() =>
      expect(apiPutMock).toHaveBeenCalledWith("/settings", {
        openaiApiKey: "sk-test",
      }),
    );
  });

  it("connects to Ollama and allows selecting an active Ollama model", async () => {
    renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "General" }));
    await user.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith("/settings/ollama/connect", {
        ollamaBaseUrl: "http://127.0.0.1:11434",
      }),
    );

    const activeModelTrigger = await screen.findByLabelText("Active model");
    await user.click(activeModelTrigger);
    await user.click(await screen.findByRole("option", { name: "qwen3:8b" }));

    await waitFor(() =>
      expect(apiPutMock).toHaveBeenCalledWith("/settings", {
        activeModel: "qwen3:8b",
      }),
    );
  });
});
