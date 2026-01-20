import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { entriesQueries } from "@/api/entries";
import { conversationQueries } from "@/api/conversations";
import { useAgentConversationContext } from "@/context/AgentConversationContext";
import { buildActivityItems } from "@/lib/activity-items";
import type { ContentTypeFilter } from "@/components/ContentTypeTabs";
import { useYouTubeFeed } from "@/hooks/useYouTubeFeed";

interface UseActivityItemsOptions {
  contentTypeFilter: ContentTypeFilter;
  publicOnly: boolean;
}

export function useActivityItems({
  contentTypeFilter,
  publicOnly,
}: UseActivityItemsOptions) {
  const { isDemo } = useAgentConversationContext();
  const entriesListQuery = useMemo(() => entriesQueries.all(), []);
  const conversationListQuery = useMemo(() => conversationQueries.list(), []);
  const entriesQuery = useQuery(entriesListQuery);
  const conversationsQuery = useQuery(conversationListQuery);

  const videoTypeFilter = useMemo<"short" | "video" | "live" | null>(() => {
    if (contentTypeFilter === "all") {
      return null;
    }
    return contentTypeFilter;
  }, [contentTypeFilter]);

  const youtubeState = useYouTubeFeed(videoTypeFilter);

  const activityItems = useMemo(
    () =>
      buildActivityItems({
        entries: entriesQuery.data,
        conversations: conversationsQuery.data,
        youtubeFeed: youtubeState.youtubeFeed,
        contentTypeFilter,
        publicOnly,
        isDemo,
      }),
    [
      contentTypeFilter,
      conversationsQuery.data,
      entriesQuery.data,
      isDemo,
      publicOnly,
      youtubeState.youtubeFeed,
    ],
  );

  return {
    activityItems,
    entriesListQuery,
    entriesQuery,
    conversationListQuery,
    conversationsQuery,
    youtubeState,
  };
}
