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

export type FieldKind = "input" | "textarea";

export interface ChecklistSection {
  title: string;
  items: string[];
}

export interface FieldDefinition {
  id: string;
  label: string;
  placeholder?: string;
  kind: FieldKind;
  className?: string;
  controlClassName?: string;
}

export type ProfileFieldKey =
  | "audienceFocus"
  | "bucketsLockedNotes"
  | "personalConnectionNotes";

export type ProfileFieldDefinition = FieldDefinition & {
  id: string;
  key: ProfileFieldKey;
};

export type BucketFieldDefinition = Omit<FieldDefinition, "id"> & {
  idSuffix: string;
  key: keyof AudienceBucket;
};

export interface ChannelProfileAdvice {
  profileFields: Record<ProfileFieldKey, ProfileFieldDefinition>;
  bucketFields: Record<string, BucketFieldDefinition>;
  checklists: Record<string, ChecklistSection>;
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
  advice: () => ({
    queryKey: ["channel", "advice"],
    queryFn: async (): Promise<ChannelProfileAdvice> => {
      const { data } =
        await apiClient.get<ChannelProfileAdvice>("/channel/advice");
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
