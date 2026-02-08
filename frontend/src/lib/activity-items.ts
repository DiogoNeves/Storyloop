import type { Conversation } from "@/api/conversations";
import type { Entry } from "@/api/entries";
import type { YoutubeFeedResponse } from "@/api/youtube";
import type { ContentTypeFilter } from "@/components/ContentTypeTabs";
import {
  compareActivityItemsByPinnedDate,
  entryToActivityItem,
  type ActivityItem,
} from "@/lib/types/entries";
import { extractTagsFromContent } from "@/lib/activity-tags";

const MAX_ACTIVITY_ITEMS = 50;

interface BuildActivityItemsOptions {
  entries?: Entry[] | null;
  conversations?: Conversation[] | null;
  youtubeFeed?: YoutubeFeedResponse | null;
  contentTypeFilter: ContentTypeFilter;
  publicOnly: boolean;
  isDemo?: boolean;
  now?: number;
}

export function buildActivityItems({
  entries,
  conversations,
  youtubeFeed,
  contentTypeFilter,
  publicOnly,
  isDemo = false,
  now,
}: BuildActivityItemsOptions): ActivityItem[] {
  const conversationActivityItems = buildConversationActivityItems(
    conversations ?? [],
    isDemo,
    now,
  );
  const storedActivityItems = (entries ?? []).map(entryToActivityItem);
  const baseItems = [...conversationActivityItems, ...storedActivityItems];

  const videoItems = buildVideoActivityItems(
    youtubeFeed,
    contentTypeFilter,
    publicOnly,
  );

  const seenIds = new Set(baseItems.map((item) => item.id));
  const uniqueVideoItems = videoItems.filter((item) => {
    if (seenIds.has(item.id)) {
      return false;
    }
    seenIds.add(item.id);
    return true;
  });

  return [...baseItems, ...uniqueVideoItems]
    .sort(compareActivityItemsByPinnedDate)
    .slice(0, MAX_ACTIVITY_ITEMS);
}

function buildConversationActivityItems(
  conversations: Conversation[],
  isDemo: boolean,
  now = Date.now(),
): ActivityItem[] {
  if (isDemo) {
    return buildDemoConversationItems(now);
  }

  return conversations
    .filter((conversation) => (conversation.turnCount ?? 0) > 0)
    .map((conversation) => {
      const firstTurnTitle = conversation.firstTurnText?.trim();
      const trimmedSummary = conversation.lastTurnText?.trim();
      const title =
        firstTurnTitle && firstTurnTitle.length > 0
          ? firstTurnTitle
          : (conversation.title ?? "Loopie conversation");
      return {
        id: conversation.id,
        title,
        summary:
          trimmedSummary && trimmedSummary.length > 0
            ? trimmedSummary
            : "Jump into this Loopie conversation to keep building.",
        tags: extractTagsFromContent(title, trimmedSummary),
        date: conversation.lastTurnAt ?? conversation.createdAt,
        category: "conversation" as const,
      };
    });
}

function buildDemoConversationItems(now: number): ActivityItem[] {
  return [
    {
      id: "demo-conversation-1",
      title: "Loopie summarized your audience research sprint",
      summary:
        "Loopie connected sentiment shifts across shorts, distilled the most replayed hooks, and drafted the next set of experiments for the July uploads. #audience #hooks",
      tags: extractTagsFromContent(
        "Loopie summarized your audience research sprint",
        "Loopie connected sentiment shifts across shorts, distilled the most replayed hooks, and drafted the next set of experiments for the July uploads. #audience #hooks",
      ),
      date: new Date(now - 1000 * 60 * 35).toISOString(),
      category: "conversation",
    },
    {
      id: "demo-conversation-2",
      title: "Quick check-in about pacing",
      summary:
        "Loopie pinpointed the moment to trim and suggested a tighter intro beat. #pacing",
      tags: extractTagsFromContent(
        "Quick check-in about pacing",
        "Loopie pinpointed the moment to trim and suggested a tighter intro beat. #pacing",
      ),
      date: new Date(now - 1000 * 60 * 90).toISOString(),
      category: "conversation",
    },
  ];
}

function buildVideoActivityItems(
  youtubeFeed: YoutubeFeedResponse | null | undefined,
  contentTypeFilter: ContentTypeFilter,
  publicOnly: boolean,
): ActivityItem[] {
  const videos = Array.isArray(youtubeFeed?.videos)
    ? youtubeFeed?.videos
    : [];

  if (videos.length === 0) {
    return [];
  }

  const videoItems = videos.map((video) => ({
    id: `youtube:${video.id}`,
    title: video.title,
    summary: video.description,
    tags: extractTagsFromContent(video.title, video.description),
    date: video.publishedAt,
    category: "content" as const,
    linkUrl: video.url,
    thumbnailUrl: video.thumbnailUrl ?? undefined,
    videoId: video.id,
    videoType: video.videoType,
    privacyStatus: video.privacyStatus,
  }));

  return videoItems.filter((item) => {
    if (!item.videoType) {
      if (contentTypeFilter !== "all") return false;
    } else if (contentTypeFilter !== "all") {
      if (item.videoType !== contentTypeFilter) return false;
    }

    if (publicOnly) {
      if (item.privacyStatus !== "public") return false;
    }

    return true;
  });
}
