import type { AudienceBucket } from "@/api/channel";
import { Button } from "@/components/ui/button";
import {
  bucketFieldDefinitions,
  checklistContent,
  profileFieldDefinitions,
} from "@/components/channel-profile/channelProfileContent";
import { BucketCard } from "@/components/channel-profile/BucketCard";
import { BucketField } from "@/components/channel-profile/BucketField";
import { ChecklistCard } from "@/components/channel-profile/ChecklistCard";
import { ProfileField } from "@/components/channel-profile/ProfileField";
import { SectionCard } from "@/components/channel-profile/SectionCard";

type AudienceBucketsSectionProps = {
  buckets: AudienceBucket[];
  minBuckets: number;
  maxBuckets: number;
  bucketsLockedNotes: string;
  personalConnectionNotes: string;
  onAddBucket: () => void;
  onRemoveBucket: (bucketId: string) => void;
  onUpdateBucket: (bucketId: string, updates: Partial<AudienceBucket>) => void;
  onBucketsLockedNotesChange: (value: string) => void;
  onPersonalConnectionNotesChange: (value: string) => void;
};

export function AudienceBucketsSection({
  buckets,
  minBuckets,
  maxBuckets,
  bucketsLockedNotes,
  personalConnectionNotes,
  onAddBucket,
  onRemoveBucket,
  onUpdateBucket,
  onBucketsLockedNotesChange,
  onPersonalConnectionNotesChange,
}: AudienceBucketsSectionProps) {
  const canRemove = buckets.length > minBuckets;
  const atMaxBuckets = buckets.length >= maxBuckets;

  return (
    <SectionCard
      title="Steps 2–6: Build your audience buckets"
      description="Create 3–4 distinct groups, name them in human terms, and pressure-test your care and understanding."
      contentClassName="space-y-4"
    >
      {buckets.map((bucket, index) => (
        <BucketCard
          key={bucket.id}
          title={`Audience bucket ${index + 1}`}
          showRemove={canRemove}
          onRemove={() => onRemoveBucket(bucket.id)}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <BucketField
              bucket={bucket}
              definition={bucketFieldDefinitions.name}
              onUpdate={onUpdateBucket}
            />
            <BucketField
              bucket={bucket}
              definition={bucketFieldDefinitions.description}
              onUpdate={onUpdateBucket}
            />
            <BucketField
              bucket={bucket}
              definition={bucketFieldDefinitions.careAndUnderstanding}
              onUpdate={onUpdateBucket}
            />
            <ChecklistCard
              title={checklistContent.careNote.title}
              items={checklistContent.careNote.items}
              className="p-3 sm:col-span-2"
            />
            <BucketField
              bucket={bucket}
              definition={bucketFieldDefinitions.otherCreatorsWatched}
              onUpdate={onUpdateBucket}
            />
            <ChecklistCard
              title={checklistContent.creatorsNote.title}
              items={checklistContent.creatorsNote.items}
              className="p-3 sm:col-span-2"
            />
            <BucketField
              bucket={bucket}
              definition={bucketFieldDefinitions.personalConnectionNotes}
              onUpdate={onUpdateBucket}
            />
          </div>
        </BucketCard>
      ))}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Aim for 3–4 distinct buckets.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={onAddBucket}
          disabled={atMaxBuckets}
        >
          Add audience bucket
        </Button>
      </div>
      <ChecklistCard
        title={checklistContent.bucketMental.title}
        items={checklistContent.bucketMental.items}
        className="p-4"
      />
      <ProfileField
        field={profileFieldDefinitions.bucketsLockedNotes}
        value={bucketsLockedNotes}
        onChange={onBucketsLockedNotesChange}
      />
      <ChecklistCard
        title={checklistContent.bucketsLockedMental.title}
        items={checklistContent.bucketsLockedMental.items}
        className="p-4"
      />
      <ProfileField
        field={profileFieldDefinitions.personalConnectionNotes}
        value={personalConnectionNotes}
        onChange={onPersonalConnectionNotesChange}
      />
    </SectionCard>
  );
}
