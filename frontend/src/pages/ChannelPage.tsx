import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  channelQueries,
  updateChannelProfile,
  type AudienceBucket,
  type ChannelProfile,
} from "@/api/channel";
import { AudienceBucketsSection } from "@/components/channel-profile/AudienceBucketsSection";
import { AudienceFocusSection } from "@/components/channel-profile/AudienceFocusSection";
import { ChannelHeader } from "@/components/channel-profile/ChannelHeader";
import {
  MAX_BUCKETS,
  MIN_BUCKETS,
} from "@/components/channel-profile/channelProfileContent";
import { FrameworkFilterSection } from "@/components/channel-profile/FrameworkFilterSection";
import { SaveBar } from "@/components/channel-profile/SaveBar";
import { ValueAuditSection } from "@/components/channel-profile/ValueAuditSection";
import { useAgentConversationContext } from "@/context/AgentConversationContext";
import type { AgentFocus } from "@/lib/types/agent";

const createEmptyBucket = (): AudienceBucket => ({
  id: crypto.randomUUID(),
  name: "",
  description: "",
  careAndUnderstanding: "",
  otherCreatorsWatched: "",
  personalConnectionNotes: "",
  valueEmotion: "",
  valueAction: "",
  valueNotes: "",
});

const createEmptyProfile = (): ChannelProfile => ({
  audienceFocus: "",
  personalConnectionNotes: "",
  bucketsLockedNotes: "",
  audienceBuckets: Array.from({ length: MIN_BUCKETS }, createEmptyBucket),
});

const normalizeProfile = (profile: ChannelProfile | null): ChannelProfile => {
  const base = profile ?? createEmptyProfile();
  const baseProfile: ChannelProfile = { ...base };
  delete baseProfile.personalConnectionConfirmed;
  delete baseProfile.bucketsLocked;
  const buckets = (baseProfile.audienceBuckets ?? []).map((bucket) => {
    const bucketRest: AudienceBucket = { ...bucket };
    delete bucketRest.careAndUnderstandingConfirmed;
    delete bucketRest.personalConnection;
    delete bucketRest.valueSpecific;
    delete bucketRest.valueRealistic;
    delete bucketRest.valueRepeatable;
    return {
      ...createEmptyBucket(),
      ...bucketRest,
      id: bucket.id || crypto.randomUUID(),
    };
  });
  while (buckets.length < MIN_BUCKETS) {
    buckets.push(createEmptyBucket());
  }
  return {
    ...createEmptyProfile(),
    ...baseProfile,
    audienceBuckets: buckets.slice(0, MAX_BUCKETS),
  };
};

export function ChannelPage() {
  const queryClient = useQueryClient();
  const channelQuery = useQuery(channelQueries.profile());
  const adviceQuery = useQuery(channelQueries.advice());
  const [profile, setProfile] = useState<ChannelProfile>(createEmptyProfile);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { setFocus } = useAgentConversationContext();

  useEffect(() => {
    if (!channelQuery.data) {
      return;
    }
    setProfile(normalizeProfile(channelQuery.data.profile));
  }, [channelQuery.data]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (typeof window.matchMedia !== "function") {
      setFocus(null);
      return;
    }
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    if (!isDesktop) {
      setFocus(null);
      return;
    }
    setFocus({
      category: "channel",
      id: "channel-profile",
      title: "Channel profile",
      route: "/channel",
    } as AgentFocus);
    return () => {
      setFocus(null);
    };
  }, [setFocus]);

  const updateMutation = useMutation({
    mutationFn: updateChannelProfile,
    onSuccess: (data) => {
      queryClient.setQueryData(channelQueries.profile().queryKey, data);
      setProfile(normalizeProfile(data.profile));
      setSaveError(null);
      setSaveMessage("Channel profile saved.");
    },
    onError: () => {
      setSaveMessage(null);
      setSaveError("We couldn't save the channel profile. Try again.");
    },
  });

  const handleSave = useCallback(
    (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      setSaveMessage(null);
      setSaveError(null);
      updateMutation.mutate(profile);
    },
    [profile, updateMutation],
  );

  const updateProfile = useCallback((updates: Partial<ChannelProfile>) => {
    setProfile((previous) => ({ ...previous, ...updates }));
    setSaveMessage(null);
    setSaveError(null);
  }, []);

  const updateBucket = useCallback(
    (bucketId: string, updates: Partial<AudienceBucket>) => {
      setProfile((previous) => ({
        ...previous,
        audienceBuckets: previous.audienceBuckets.map((bucket) =>
          bucket.id === bucketId ? { ...bucket, ...updates } : bucket,
        ),
      }));
      setSaveMessage(null);
      setSaveError(null);
    },
    [],
  );

  const handleAddBucket = useCallback(() => {
    setProfile((previous) => {
      if (previous.audienceBuckets.length >= MAX_BUCKETS) {
        return previous;
      }
      return {
        ...previous,
        audienceBuckets: [...previous.audienceBuckets, createEmptyBucket()],
      };
    });
    setSaveMessage(null);
    setSaveError(null);
  }, []);

  const handleRemoveBucket = useCallback((bucketId: string) => {
    setProfile((previous) => {
      if (previous.audienceBuckets.length <= MIN_BUCKETS) {
        return previous;
      }
      return {
        ...previous,
        audienceBuckets: previous.audienceBuckets.filter(
          (bucket) => bucket.id !== bucketId,
        ),
      };
    });
    setSaveMessage(null);
    setSaveError(null);
  }, []);

  const lastUpdatedLabel = useMemo(() => {
    const updatedAt = channelQuery.data?.updatedAt;
    if (!updatedAt) {
      return "Not saved yet.";
    }
    const date = new Date(updatedAt);
    if (Number.isNaN(date.getTime())) {
      return "Updated recently.";
    }
    return `Last updated ${date.toLocaleString()}`;
  }, [channelQuery.data?.updatedAt]);

  const isSaving = updateMutation.isPending;
  const advice = adviceQuery.data;

  if (!advice) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-6 pr-2 sm:gap-6 sm:pr-4">
        <ChannelHeader
          lastUpdatedLabel={lastUpdatedLabel}
          isSaving={isSaving}
          onSave={() => handleSave()}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-6 pr-2 sm:gap-6 sm:pr-4">
      <ChannelHeader
        lastUpdatedLabel={lastUpdatedLabel}
        isSaving={isSaving}
        onSave={() => handleSave()}
      />

      <form className="flex min-h-0 flex-col gap-4" onSubmit={handleSave}>
        <AudienceFocusSection
          advice={advice}
          value={profile.audienceFocus ?? ""}
          onChange={(value) =>
            updateProfile({ audienceFocus: value } as Partial<ChannelProfile>)
          }
        />

        <AudienceBucketsSection
          advice={advice}
          buckets={profile.audienceBuckets}
          minBuckets={MIN_BUCKETS}
          maxBuckets={MAX_BUCKETS}
          bucketsLockedNotes={profile.bucketsLockedNotes ?? ""}
          personalConnectionNotes={profile.personalConnectionNotes ?? ""}
          onAddBucket={handleAddBucket}
          onRemoveBucket={handleRemoveBucket}
          onUpdateBucket={updateBucket}
          onBucketsLockedNotesChange={(value) =>
            updateProfile({
              bucketsLockedNotes: value,
            } as Partial<ChannelProfile>)
          }
          onPersonalConnectionNotesChange={(value) =>
            updateProfile({
              personalConnectionNotes: value,
            } as Partial<ChannelProfile>)
          }
        />

        <ValueAuditSection
          advice={advice}
          buckets={profile.audienceBuckets}
          onUpdateBucket={updateBucket}
        />

        <FrameworkFilterSection />

        <SaveBar
          saveMessage={saveMessage}
          saveError={saveError}
          hasLoadError={channelQuery.isError}
          isSaving={isSaving}
        />
      </form>
    </div>
  );
}
