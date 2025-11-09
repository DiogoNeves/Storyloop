import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { LinkYouTubeAccountCard } from "@/components/LinkYouTubeAccountCard";

const linkStatusMock = vi.fn();
const startLinkMock = vi.fn();

vi.mock("@/api/youtube", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/youtube")>();
  return {
    ...actual,
    youtubeApi: {
      ...actual.youtubeApi,
      startLink: () => Promise.resolve(startLinkMock()),
      linkStatus: () => Promise.resolve(linkStatusMock()),
    },
    youtubeQueries: {
      ...actual.youtubeQueries,
      authStatus: () => ({
        queryKey: ["youtube", "auth", "status"],
        queryFn: () => Promise.resolve(linkStatusMock()),
      }),
    },
  };
});

const originalError = console.error;

beforeAll(() => {
  console.error = vi.fn();
});

afterAll(() => {
  console.error = originalError;
});

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("LinkYouTubeAccountCard", () => {
  beforeEach(() => {
    linkStatusMock.mockReset();
    startLinkMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders a loading state while link status is pending", () => {
    linkStatusMock.mockReturnValue(new Promise(() => {
      // Intentionally empty promise for loading state test
    }));

    renderWithClient(<LinkYouTubeAccountCard />);

    expect(
      screen.getByText(/Checking YouTube link status/i),
    ).toBeInTheDocument();
  });

  it("allows retrying when the status request fails", async () => {
    linkStatusMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        linked: false,
        refreshNeeded: false,
        channel: null,
      });

    renderWithClient(<LinkYouTubeAccountCard />);

    expect(
      await screen.findByText(/We couldn't check your YouTube link/i),
    ).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: /retry/i });
    const user = userEvent.setup();
    await user.click(retryButton);

    await waitFor(() => {
      expect(linkStatusMock).toHaveBeenCalledTimes(2);
    });
  });

  it("starts the OAuth flow when unlinked", async () => {
    linkStatusMock.mockResolvedValue({
      linked: false,
      refreshNeeded: false,
      channel: null,
    });
    startLinkMock.mockResolvedValue({
      authorizationUrl: "https://example.com/auth",
      state: "abc",
    });
    const openSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => null as unknown as Window);

    renderWithClient(<LinkYouTubeAccountCard />);

    const button = await screen.findByRole("button", { name: /link channel/i });
    const user = userEvent.setup();
    await user.click(button);

    expect(startLinkMock).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith("https://example.com/auth", "_self");
    });

    openSpy.mockRestore();
  });

  it("shows an error if starting the OAuth flow fails", async () => {
    linkStatusMock.mockResolvedValue({
      linked: false,
      refreshNeeded: false,
      channel: null,
    });
    startLinkMock.mockRejectedValue(new Error("start failed"));

    renderWithClient(<LinkYouTubeAccountCard />);

    const button = await screen.findByRole("button", { name: /link channel/i });
    const user = userEvent.setup();
    await user.click(button);

    expect(await screen.findByText(/start failed/i)).toBeInTheDocument();
  });

  it("displays linked channel details", async () => {
    linkStatusMock.mockResolvedValue({
      linked: true,
      refreshNeeded: true,
      channel: {
        id: "UC123",
        title: "Storyloop",
        url: "https://www.youtube.com/channel/UC123",
        thumbnailUrl: "https://img.youtube.com/123.jpg",
        updatedAt: "2024-01-01T00:00:00Z",
      },
    });

    renderWithClient(<LinkYouTubeAccountCard />);

    expect(
      await screen.findByText(/Connected YouTube channel/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Storyloop/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /View channel on YouTube/i });
    expect(link).toHaveAttribute(
      "href",
      "https://www.youtube.com/channel/UC123",
    );
    expect(
      screen.queryByRole("button", { name: /link channel/i }),
    ).not.toBeInTheDocument();
  });
});

