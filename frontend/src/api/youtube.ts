import { createQueryKeys } from "@lukemorales/query-key-factory";

import { apiClient } from "@/api/client";
import type { Entry } from "@/api/entries";

export interface YouTubeVideosParams {
  channelId: string;
  maxResults?: number;
}

export const youtubeQueries = createQueryKeys("youtube", {
  videos: (params: YouTubeVideosParams) => ({
    queryKey: ["youtube", "videos", params.channelId],
    queryFn: async (): Promise<Entry[]> => {
      const { data } = await apiClient.get<Entry[]>("/youtube/videos", {
        params: {
          channel_id: params.channelId,
          max_results: params.maxResults ?? 50,
        },
      });
      return data;
    },
  }),
});
