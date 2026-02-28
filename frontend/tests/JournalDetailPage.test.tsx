import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { type Entry } from "@/api/entries";
import { JournalDetailPage } from "@/pages/JournalDetailPage";
import { AgentConversationProvider } from "@/context/AgentConversationContext";
import { SettingsProvider } from "@/context/SettingsProvider";
import { SyncProvider } from "@/context/SyncProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getTodayEntryDisplayTitle } from "@/lib/today-entry";

const apiGetMock = vi.hoisted(() => vi.fn());
const apiPostMock = vi.hoisted(() => vi.fn());
const apiPutMock = vi.hoisted(() => vi.fn());
const useAudioDictationMock = vi.hoisted(() => vi.fn());
const journalEditorFocusMock = vi.hoisted(() => vi.fn());
const journalEditorFocusAtEndMock = vi.hoisted(() => vi.fn());
const journalEditorOnChangeRef = vi.hoisted(() => ({
  current: null as null | ((markdown: string) => void),
}));

vi.mock("@/components/LoopiePanel", () => ({
  LoopiePanel: () => <div data-testid="agent-panel" />,
}));

vi.mock("@/components/JournalEntryEditor", async () => {
  const React = await import("react");

  const JournalEntryEditor = React.forwardRef<
    { focus: () => void; focusAtEnd: () => void },
    Record<string, unknown>
  >((props, ref) => {
    journalEditorOnChangeRef.current =
      typeof props.onChange === "function"
        ? (props.onChange as (markdown: string) => void)
        : null;
    React.useImperativeHandle(
      ref,
      () => ({
        focus: journalEditorFocusMock,
        focusAtEnd: journalEditorFocusAtEndMock,
      }),
      [],
    );
    return <div data-testid="journal-editor" />;
  });

  JournalEntryEditor.displayName = "JournalEntryEditor";

  return { JournalEntryEditor };
});

vi.mock("@/api/client", () => ({
  apiClient: {
    get: apiGetMock,
    post: apiPostMock,
    put: apiPutMock,
  },
  API_BASE_URL: "http://localhost:8000",
}));

vi.mock("@/hooks/useAudioDictation", () => ({
  useAudioDictation: useAudioDictationMock,
}));

vi.mock("@/hooks/useDebouncedAutosave", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useDebouncedAutosave")>();
  return {
    ...actual,
    useDebouncedAutosave: (options: {
      entryId: string | null;
      title: string;
      summary: string;
      enabled: boolean;
      isBlocked?: boolean;
      debounceMs?: number;
    }) => actual.useDebouncedAutosave({ ...options, debounceMs: 0 }),
  };
});

const sampleEntry: Entry = {
  id: "entry-1",
  title: "Morning walk notes",
  summary: "Thoughts captured after a walk.",
  date: "2024-05-01T12:00:00Z",
  updatedAt: "2024-05-01T12:00:00Z",
  lastSmartUpdateAt: null,
  category: "journal",
  linkUrl: null,
  thumbnailUrl: null,
  pinned: false,
};

const todayEntry: Entry = {
  id: "today-2026-02-16",
  title: "Today",
  summary: "- [ ] Plan intro\n- [ ]",
  date: "2026-02-16T00:00:00.000Z",
  updatedAt: "2026-02-16T00:00:00.000Z",
  lastSmartUpdateAt: null,
  category: "today",
  linkUrl: null,
  thumbnailUrl: null,
  pinned: false,
};

const defaultSettingsResponse = {
  smartUpdateScheduleHours: 24,
  showArchived: false,
  activityFeedSortDate: "created",
  todayEntriesEnabled: true,
  todayIncludePreviousIncomplete: true,
  todayMoveCompletedToEnd: true,
  accentColor: "crimson",
  openaiKeyConfigured: true,
  ollamaBaseUrl: "http://127.0.0.1:11434",
  activeModel: "openai",
};

function renderPage(ui: ReactElement, initialPath = `/journals/${sampleEntry.id}`) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SyncProvider>
        <TooltipProvider>
          <AgentConversationProvider>
            <MemoryRouter initialEntries={[initialPath]}>
              <SettingsProvider>
                <Routes>
                  <Route path="/journals/:journalId" element={ui} />
                </Routes>
              </SettingsProvider>
            </MemoryRouter>
          </AgentConversationProvider>
        </TooltipProvider>
      </SyncProvider>
    </QueryClientProvider>,
  );
}

function getCardScrollBody(collapsedHeader: HTMLElement): HTMLDivElement {
  const card = collapsedHeader.closest("section");
  if (!card) {
    throw new Error("Expected collapsed header to be inside a card section.");
  }
  const scrollBody = card.querySelector<HTMLDivElement>(".overflow-y-auto");
  if (!scrollBody) {
    throw new Error("Expected card to include a scroll body.");
  }
  return scrollBody;
}

describe("JournalDetailPage", () => {
  beforeEach(() => {
    journalEditorOnChangeRef.current = null;
    journalEditorFocusMock.mockReset();
    journalEditorFocusAtEndMock.mockReset();
    apiGetMock.mockReset();
    apiPostMock.mockReset();
    apiPutMock.mockReset();
    apiGetMock.mockImplementation((url: string) => {
      if (url === "/settings") {
        return Promise.resolve({ data: defaultSettingsResponse });
      }
      if (url === "/health") {
        return Promise.resolve({
          data: {
            status: "Storyloop API ready",
            youtubeDemoMode: false,
            agentAvailable: true,
          },
        });
      }
      if (url.startsWith("/entries/")) {
        return Promise.resolve({ data: sampleEntry });
      }
      if (url.startsWith("/entries")) {
        return Promise.resolve({ data: [] });
      }
      if (url.startsWith("/conversations")) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: sampleEntry });
    });
    apiPutMock.mockImplementation(
      (url: string, payload: Record<string, unknown>) => {
        if (url.startsWith("/entries/")) {
          return Promise.resolve({
            data: {
              ...sampleEntry,
              ...payload,
            },
          });
        }
        return Promise.resolve({ data: sampleEntry });
      },
    );
    apiPostMock.mockImplementation((url: string) => {
      if (url.endsWith("/opened")) {
        return Promise.resolve({
          data: {
            ...sampleEntry,
            lastOpenedAt: "2026-02-16T23:00:00Z",
          },
        });
      }
      return Promise.resolve({ data: sampleEntry });
    });
    useAudioDictationMock.mockReset();
    useAudioDictationMock.mockReturnValue({
      status: "idle",
      inputLevel: 0,
      elapsedSeconds: 0,
      isSupported: true,
      errorMessage: null,
      startDictation: vi.fn(),
      stopDictation: vi.fn(),
      toggleDictation: vi.fn(),
      clearError: vi.fn(),
    });
    localStorage.clear();
  });

  it("removes adjacent video cards from the detail footer", async () => {
    renderPage(<JournalDetailPage />);

    expect(
      await screen.findByDisplayValue(sampleEntry.title),
    ).toBeInTheDocument();

    expect(
      screen.queryByText(/Published before this journal/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Published after this journal/i),
    ).not.toBeInTheDocument();
  });

  it("shows the collapsed mobile header after scrolling the detail card", async () => {
    renderPage(<JournalDetailPage />);

    expect(
      await screen.findByDisplayValue(sampleEntry.title),
    ).toBeInTheDocument();

    const collapsedHeader = screen.getByTestId("mobile-collapsed-header");
    expect(collapsedHeader).toHaveAttribute("aria-hidden", "true");

    const scrollBody = getCardScrollBody(collapsedHeader);
    Object.defineProperty(scrollBody, "scrollTop", {
      value: 72,
      writable: true,
      configurable: true,
    });
    fireEvent.scroll(scrollBody);

    expect(collapsedHeader).toHaveAttribute("aria-hidden", "false");
    expect(within(collapsedHeader).getByText(sampleEntry.title)).toBeInTheDocument();
  });

  it("keeps /journals/new title editable and mirrors it in the mobile header", async () => {
    renderPage(<JournalDetailPage />, "/journals/new");

    const titleInput = await screen.findByPlaceholderText("Untitled entry");
    const collapsedHeader = screen.getByTestId("mobile-collapsed-header");

    expect(within(collapsedHeader).getByText("New entry")).toBeInTheDocument();

    fireEvent.change(titleInput, { target: { value: "Launch plan" } });

    expect(titleInput).toHaveValue("Launch plan");
    expect(within(collapsedHeader).getByText("Launch plan")).toBeInTheDocument();
  });

  it("normalizes new lines in the journal title input", async () => {
    renderPage(<JournalDetailPage />);

    const titleInput = await screen.findByDisplayValue(sampleEntry.title);
    fireEvent.change(titleInput, {
      target: { value: "New\nvideo ideas" },
    });

    expect(titleInput).toHaveValue("New video ideas");
  });

  it("focuses the editor at the end when clicking the empty trailing area", async () => {
    renderPage(<JournalDetailPage />);

    expect(
      await screen.findByDisplayValue(sampleEntry.title),
    ).toBeInTheDocument();

    const editor = screen.getByTestId("journal-editor");
    const scrollBody = editor.closest(".overflow-y-auto");
    expect(scrollBody).not.toBeNull();
    if (!scrollBody) {
      return;
    }

    fireEvent.click(scrollBody, { clientY: 10 });

    expect(journalEditorFocusAtEndMock).toHaveBeenCalledTimes(1);
  });

  it("archives an entry from the detail header", async () => {
    renderPage(<JournalDetailPage />);
    const user = userEvent.setup();

    const archiveButton = await screen.findByRole("button", {
      name: /Archive entry/i,
    });
    await user.click(archiveButton);

    await waitFor(() => {
      expect(apiPutMock).toHaveBeenCalledWith(`/entries/${sampleEntry.id}`, {
        archived: true,
      });
    });
  });

  it("shows regenerate before edit prompt on smart entries and streams on click", async () => {
    const smartEntry: Entry = {
      ...sampleEntry,
      promptBody: "Keep this concise.",
      promptFormat: "Bulleted list",
      lastSmartUpdateAt: "2026-02-16T22:51:00Z",
    };

    apiGetMock.mockImplementation((url: string) => {
      if (url === "/settings") {
        return Promise.resolve({ data: defaultSettingsResponse });
      }
      if (url.startsWith("/entries/")) {
        return Promise.resolve({ data: smartEntry });
      }
      if (url.startsWith("/entries")) {
        return Promise.resolve({ data: [smartEntry] });
      }
      if (url.startsWith("/conversations")) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: smartEntry });
    });
    apiPostMock.mockImplementation((url: string) => {
      if (url === `/entries/${smartEntry.id}/opened`) {
        return Promise.resolve({
          data: {
            ...smartEntry,
            lastOpenedAt: "2026-02-16T23:10:00Z",
          },
        });
      }
      return Promise.resolve({ data: smartEntry });
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("failed", { status: 500 }));

    try {
      renderPage(<JournalDetailPage />);
      const user = userEvent.setup();

      const regenerateButton = await screen.findByRole("button", {
        name: /Regenerate smart entry/i,
      });
      const editPromptButton = screen.getByRole("button", {
        name: /Edit prompt/i,
      });
      expect(
        regenerateButton.compareDocumentPosition(editPromptButton) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      await user.click(regenerateButton);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          `http://localhost:8000/entries/${smartEntry.id}/smart/stream`,
          expect.objectContaining({
            method: "POST",
          }),
        );
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("marks smart entries as opened when detail page loads", async () => {
    const smartEntry: Entry = {
      ...sampleEntry,
      promptBody: "Keep this concise.",
      promptFormat: "Bulleted list",
      lastSmartUpdateAt: "2026-02-16T22:51:00Z",
    };

    apiGetMock.mockImplementation((url: string) => {
      if (url === "/settings") {
        return Promise.resolve({ data: defaultSettingsResponse });
      }
      if (url.startsWith("/entries/")) {
        return Promise.resolve({ data: smartEntry });
      }
      if (url.startsWith("/entries")) {
        return Promise.resolve({ data: [smartEntry] });
      }
      if (url.startsWith("/conversations")) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: smartEntry });
    });
    apiPostMock.mockImplementation((url: string) => {
      if (url === `/entries/${smartEntry.id}/opened`) {
        return Promise.resolve({
          data: {
            ...smartEntry,
            lastOpenedAt: "2026-02-16T23:10:00Z",
          },
        });
      }
      return Promise.resolve({ data: smartEntry });
    });

    renderPage(<JournalDetailPage />);

    expect(
      await screen.findByRole("button", { name: /Regenerate smart entry/i }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith(
        `/entries/${smartEntry.id}/opened`,
      );
    });
  });

  it("renders the Today checklist editor and hides pin/archive controls", async () => {
    apiGetMock.mockImplementation((url: string) => {
      if (url === "/settings") {
        return Promise.resolve({ data: defaultSettingsResponse });
      }
      if (url === `/entries/${todayEntry.id}`) {
        return Promise.resolve({ data: todayEntry });
      }
      if (url.startsWith("/entries/")) {
        return Promise.resolve({ data: todayEntry });
      }
      if (url.startsWith("/entries")) {
        return Promise.resolve({ data: [todayEntry] });
      }
      if (url.startsWith("/conversations")) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: todayEntry });
    });

    renderPage(<JournalDetailPage />, `/journals/${todayEntry.id}`);

    const expectedTodayTitle = getTodayEntryDisplayTitle(
      todayEntry.id,
      todayEntry.date,
    );
    expect(await screen.findByRole("heading", { name: expectedTodayTitle })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Type a task…")).toBeInTheDocument();
    expect(screen.queryByTestId("journal-editor")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pin entry")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Archive entry")).not.toBeInTheDocument();
  });

  it("shows archived date copy for archived entries", async () => {
    const archivedEntry: Entry = {
      ...sampleEntry,
      archived: true,
      updatedAt: "2024-05-03T12:00:00Z",
      archivedAt: "2024-05-02T09:30:00Z",
    };

    apiGetMock.mockImplementation((url: string) => {
      if (url === "/settings") {
        return Promise.resolve({ data: defaultSettingsResponse });
      }
      if (url.startsWith("/entries/")) {
        return Promise.resolve({ data: archivedEntry });
      }
      if (url.startsWith("/entries")) {
        return Promise.resolve({ data: [] });
      }
      if (url.startsWith("/conversations")) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: archivedEntry });
    });
    renderPage(<JournalDetailPage />);

    expect(await screen.findByText(/Archived /i)).toBeInTheDocument();
    expect(screen.queryByText(/Archived date unavailable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Updated /i)).not.toBeInTheDocument();
  });

  it("unarchives an entry from the detail header", async () => {
    const archivedEntry: Entry = {
      ...sampleEntry,
      archived: true,
    };

    apiGetMock.mockImplementation((url: string) => {
      if (url === "/settings") {
        return Promise.resolve({ data: defaultSettingsResponse });
      }
      if (url.startsWith("/entries/")) {
        return Promise.resolve({ data: archivedEntry });
      }
      if (url.startsWith("/entries")) {
        return Promise.resolve({ data: [] });
      }
      if (url.startsWith("/conversations")) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: archivedEntry });
    });

    apiPutMock.mockImplementation(
      (url: string, payload: Record<string, unknown>) => {
        if (url.startsWith("/entries/")) {
          return Promise.resolve({
            data: {
              ...archivedEntry,
              ...payload,
            },
          });
        }
        return Promise.resolve({ data: archivedEntry });
      },
    );
    renderPage(<JournalDetailPage />);
    const user = userEvent.setup();

    const unarchiveButton = await screen.findByRole("button", {
      name: /Unarchive entry/i,
    });
    await user.click(unarchiveButton);

    await waitFor(() => {
      expect(apiPutMock).toHaveBeenCalledWith(`/entries/${sampleEntry.id}`, {
        archived: false,
      });
    });
  });

  it("shows a dictate button when the note body is empty", async () => {
    const emptyEntry: Entry = {
      ...sampleEntry,
      summary: "",
    };

    apiGetMock.mockImplementation((url: string) => {
      if (url === "/settings") {
        return Promise.resolve({ data: defaultSettingsResponse });
      }
      if (url.startsWith("/entries/")) {
        return Promise.resolve({ data: emptyEntry });
      }
      if (url.startsWith("/entries")) {
        return Promise.resolve({ data: [] });
      }
      if (url.startsWith("/conversations")) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: emptyEntry });
    });
    renderPage(<JournalDetailPage />);

    expect(
      await screen.findByRole("button", { name: /Dictate your note/i }),
    ).toBeInTheDocument();
  });

  it("shows a dictate button when the note body only has placeholders", async () => {
    const emptyPlaceholderEntry: Entry = {
      ...sampleEntry,
      summary: "<br />",
    };

    apiGetMock.mockImplementation((url: string) => {
      if (url === "/settings") {
        return Promise.resolve({ data: defaultSettingsResponse });
      }
      if (url.startsWith("/entries/")) {
        return Promise.resolve({ data: emptyPlaceholderEntry });
      }
      if (url.startsWith("/entries")) {
        return Promise.resolve({ data: [] });
      }
      if (url.startsWith("/conversations")) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: emptyPlaceholderEntry });
    });
    renderPage(<JournalDetailPage />);

    expect(
      await screen.findByRole("button", { name: /Dictate your note/i }),
    ).toBeInTheDocument();
  });

  it("inserts dictated note content and autosaves the entry", async () => {
    const emptyEntry: Entry = {
      ...sampleEntry,
      summary: "",
    };

    apiGetMock.mockImplementation((url: string) => {
      if (url === "/settings") {
        return Promise.resolve({ data: defaultSettingsResponse });
      }
      if (url.startsWith("/entries/")) {
        return Promise.resolve({ data: emptyEntry });
      }
      if (url.startsWith("/entries")) {
        return Promise.resolve({ data: [] });
      }
      if (url.startsWith("/conversations")) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: emptyEntry });
    });

    useAudioDictationMock.mockImplementation(
      ({ onTranscription }: { onTranscription: (text: string) => void }) => ({
        status: "idle",
        inputLevel: 0,
        elapsedSeconds: 0,
        isSupported: true,
        errorMessage: null,
        startDictation: vi.fn(),
        stopDictation: vi.fn(),
        clearError: vi.fn(),
        toggleDictation: vi.fn(() => {
          onTranscription("Dictated note body");
          return Promise.resolve();
        }),
      }),
    );
    renderPage(<JournalDetailPage />);
    const user = userEvent.setup();

    const dictateButton = await screen.findByRole("button", {
      name: /Dictate your note/i,
    });
    await user.click(dictateButton);

    await waitFor(
      () => {
        expect(apiPutMock).toHaveBeenCalledWith(
          `/entries/${sampleEntry.id}`,
          expect.objectContaining({
            summary: "Dictated note body",
          }),
        );
      },
      { timeout: 1500 },
    );
  });

  it("shows setup dialog instead of starting note dictation without OpenAI key", async () => {
    const emptyEntry: Entry = {
      ...sampleEntry,
      summary: "",
    };

    apiGetMock.mockImplementation((url: string) => {
      if (url === "/settings") {
        return Promise.resolve({
          data: {
            ...defaultSettingsResponse,
            openaiKeyConfigured: false,
          },
        });
      }
      if (url.startsWith("/entries/")) {
        return Promise.resolve({ data: emptyEntry });
      }
      if (url.startsWith("/entries")) {
        return Promise.resolve({ data: [] });
      }
      if (url.startsWith("/conversations")) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: emptyEntry });
    });

    const toggleDictationSpy = vi.fn(() => Promise.resolve());
    useAudioDictationMock.mockReturnValue({
      status: "idle",
      inputLevel: 0,
      elapsedSeconds: 0,
      isSupported: true,
      errorMessage: null,
      startDictation: vi.fn(),
      stopDictation: vi.fn(),
      toggleDictation: toggleDictationSpy,
      clearError: vi.fn(),
    });

    renderPage(<JournalDetailPage />);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: /Dictate your note/i }),
    );

    expect(toggleDictationSpy).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", {
        name: "OpenAI key required for dictation",
      }),
    ).toBeInTheDocument();
  });

  it("saves an empty summary when delete-all emits placeholder markdown", async () => {
    renderPage(<JournalDetailPage />);

    expect(
      await screen.findByDisplayValue(sampleEntry.title),
    ).toBeInTheDocument();

    act(() => {
      journalEditorOnChangeRef.current?.("<br />");
    });

    await waitFor(
      () => {
        expect(apiPutMock).toHaveBeenCalledWith(
          `/entries/${sampleEntry.id}`,
          expect.objectContaining({
            summary: "",
          }),
        );
      },
      { timeout: 1500 },
    );
  });
});
