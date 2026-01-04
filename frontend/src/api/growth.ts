import { createQueryKeys } from "@lukemorales/query-key-factory";

import { apiClient } from "@/api/client";

export interface GrowthScoreComponent {
  rawValue: number | null;
  score: number;
  weight: number;
}

export interface GrowthScoreBreakdown {
  discovery: GrowthScoreComponent;
  retention: GrowthScoreComponent;
  loyalty: GrowthScoreComponent;
}

export interface GrowthScoreResponse {
  totalScore: number;
  scoreDelta: number;
  updatedAt: string;
  isEarlyChannel: boolean;
  breakdown: GrowthScoreBreakdown;
}

export async function fetchGrowthScore(
  channelId?: string | null,
  videoType?: "short" | "video" | "live" | null,
) {
  const params: { channelId?: string; videoType?: string } = {};
  if (channelId) {
    params.channelId = channelId;
  }
  if (videoType) {
    params.videoType = videoType;
  }
  const response = await apiClient.get<GrowthScoreResponse>("/growth/score", {
    params: Object.keys(params).length > 0 ? params : undefined,
  });
  return response.data;
}

export const growthQueries = createQueryKeys("growth", {
  score: (channelId?: string | null) => ({
    queryKey: ["growth", "score", channelId ?? "unlinked"],
    queryFn: () => fetchGrowthScore(channelId, null),
  }),
});
