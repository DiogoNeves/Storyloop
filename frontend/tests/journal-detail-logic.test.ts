import { describe, expect, it } from "vitest";

import {
  buildPromptMarkdown,
  deriveSaveIndicator,
  findAdjacentVideos,
} from "@/lib/journal-detail-logic";
import { parseValidDate } from "@/lib/date-time";

describe("journal-detail-logic", () => {
  it("parses valid dates and rejects invalid ones", () => {
    expect(parseValidDate("2025-02-01T10:00:00Z")).toBeInstanceOf(Date);
    expect(parseValidDate("not-a-date")).toBeNull();
    expect(parseValidDate(null)).toBeNull();
  });

  it("builds prompt markdown with fallback format text", () => {
    expect(buildPromptMarkdown("Focus on hooks", null)).toContain(
      "No format guidance yet.",
    );
  });

  it("finds adjacent videos with filters applied", () => {
    const result = findAdjacentVideos(
      [
        {
          id: "v1",
          title: "Old unlisted",
          description: "",
          publishedAt: "2025-01-01T00:00:00Z",
          url: "https://youtube.com/watch?v=v1",
          thumbnailUrl: null,
          videoType: "video",
          privacyStatus: "unlisted",
        },
        {
          id: "v2",
          title: "Old public",
          description: "",
          publishedAt: "2025-01-02T00:00:00Z",
          url: "https://youtube.com/watch?v=v2",
          thumbnailUrl: null,
          videoType: "video",
          privacyStatus: "public",
        },
        {
          id: "v3",
          title: "New public",
          description: "",
          publishedAt: "2025-01-04T00:00:00Z",
          url: "https://youtube.com/watch?v=v3",
          thumbnailUrl: null,
          videoType: "video",
          privacyStatus: "public",
        },
      ],
      {
        journalDate: new Date("2025-01-03T00:00:00Z"),
        contentTypeFilter: "all",
        publicOnly: true,
      },
    );

    expect(result.previous?.id).toBe("v2");
    expect(result.next?.id).toBe("v3");
  });

  it("derives save indicator for queued state with pending update", () => {
    const indicator = deriveSaveIndicator("queued", null, true);
    expect(indicator.show).toBe(true);
    expect(indicator.message).toBe("Saved locally, syncing soon.");
  });
});
