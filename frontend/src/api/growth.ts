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

export async function fetchGrowthScore(channelId?: string | null) {
  const response = await apiClient.get<GrowthScoreResponse>("/growth/score", {
    params: channelId ? { channelId } : undefined,
  });
  return response.data;
}

export const growthQueries = createQueryKeys("growth", {
  score: (channelId?: string | null) => ({
    queryKey: ["growth", "score", channelId ?? "unlinked"],
    queryFn: () => fetchGrowthScore(channelId),
  }),
});

export const growthApi = {
  fetchGrowthScore,
};
