import { createQueryKeys } from "@lukemorales/query-key-factory";

import { apiClient } from "@/api/client";

export interface AudienceBucket {
  id: string;
  name?: string;
  description?: string;
  careAndUnderstanding?: string;
  careAndUnderstandingConfirmed?: boolean;
  otherCreatorsWatched?: string;
  personalConnection?: boolean;
  personalConnectionNotes?: string;
  valueEmotion?: string;
  valueAction?: string;
  valueSpecific?: boolean;
  valueRealistic?: boolean;
  valueRepeatable?: boolean;
  valueNotes?: string;
}

export interface ChannelProfile {
  audienceFocus?: string;
  audienceBuckets: AudienceBucket[];
  personalConnectionConfirmed?: boolean;
  personalConnectionNotes?: string;
  bucketsLocked?: boolean;
  bucketsLockedNotes?: string;
}

export interface ChannelProfileResponse {
  profile: ChannelProfile | null;
  updatedAt: string | null;
}

export const channelQueries = createQueryKeys("channel", {
  profile: () => ({
    queryKey: ["channel", "profile"],
    queryFn: async (): Promise<ChannelProfileResponse> => {
      const { data } = await apiClient.get<ChannelProfileResponse>("/channel");
      return data;
    },
  }),
});

export async function updateChannelProfile(
  profile: ChannelProfile,
): Promise<ChannelProfileResponse> {
  const { data } = await apiClient.put<ChannelProfileResponse>(
    "/channel",
    profile,
  );
  return data;
}
