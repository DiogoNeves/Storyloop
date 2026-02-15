import type { YoutubeVideoResponse } from "@/api/youtube";
import type { ContentTypeFilter } from "@/components/ContentTypeTabs";

type AutosaveStatus = "idle" | "dirty" | "saving" | "queued" | "error";

interface SaveIndicatorView {
  show: boolean;
  tone: string;
  message: string;
  isSaving: boolean;
}

const EMPTY_NOTE_TOKEN_PATTERN = /(<br\s*\/?>|&nbsp;|\u200b|\u200c|\u200d)/gi;

export function buildPromptMarkdown(
  promptBody: string | null | undefined,
  promptFormat: string | null | undefined,
): string {
  const normalizedBody = promptBody ?? "";
  const normalizedFormat = promptFormat?.trim().length
    ? promptFormat
    : "No format guidance yet.";
  return `## What to include\n\n${normalizedBody}\n\n## Format\n\n${normalizedFormat}`;
}

export function findAdjacentVideos(
  videos: YoutubeVideoResponse[] | undefined,
  options: {
    journalDate: Date | null;
    contentTypeFilter: ContentTypeFilter;
    publicOnly: boolean;
  },
): { previous: YoutubeVideoResponse | null; next: YoutubeVideoResponse | null } {
  const { journalDate, contentTypeFilter, publicOnly } = options;
  if (!videos || !journalDate) {
    return { previous: null, next: null };
  }

  const filteredVideos = videos.filter((video) => {
    if (contentTypeFilter !== "all" && video.videoType !== contentTypeFilter) {
      return false;
    }
    if (publicOnly && video.privacyStatus !== "public") {
      return false;
    }
    return true;
  });

  const sortedVideos = [...filteredVideos].sort(
    (a, b) =>
      new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime(),
  );

  let previous: YoutubeVideoResponse | null = null;
  let next: YoutubeVideoResponse | null = null;
  const journalTime = journalDate.getTime();

  for (const video of sortedVideos) {
    const publishedTime = new Date(video.publishedAt).getTime();
    if (Number.isNaN(publishedTime)) {
      continue;
    }
    if (publishedTime <= journalTime) {
      previous = video;
      continue;
    }
    next = video;
    break;
  }

  return { previous, next };
}

export function deriveSaveIndicator(
  autosaveStatus: AutosaveStatus,
  autosaveError: string | null,
  hasPendingUpdate: boolean,
): SaveIndicatorView {
  const show =
    autosaveStatus === "queued"
      ? hasPendingUpdate
      : autosaveStatus !== "idle" || hasPendingUpdate;
  const tone =
    autosaveStatus === "error"
      ? "text-destructive"
      : autosaveStatus === "queued" || hasPendingUpdate
        ? "text-amber-500"
        : "text-muted-foreground";
  const message =
    autosaveStatus === "saving"
      ? "Saving..."
      : autosaveStatus === "error"
        ? autosaveError ?? "Saved locally, couldn’t sync yet."
        : autosaveStatus === "dirty"
          ? "Unsaved changes"
          : hasPendingUpdate
            ? "Saved locally, syncing soon."
            : "Saved locally";

  return {
    show,
    tone,
    message,
    isSaving: autosaveStatus === "saving",
  };
}

export function isEffectivelyEmptyNoteContent(value: string | null | undefined): boolean {
  if (!value) {
    return true;
  }

  const normalized = value.replace(EMPTY_NOTE_TOKEN_PATTERN, "").trim();
  return normalized.length === 0;
}
