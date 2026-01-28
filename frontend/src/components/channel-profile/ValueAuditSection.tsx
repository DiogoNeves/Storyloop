import type { AudienceBucket } from "@/api/channel";
import {
  bucketFieldDefinitions,
  checklistContent,
} from "@/components/channel-profile/channelProfileContent";
import { BucketCard } from "@/components/channel-profile/BucketCard";
import { BucketField } from "@/components/channel-profile/BucketField";
import { ChecklistCard } from "@/components/channel-profile/ChecklistCard";
import { SectionCard } from "@/components/channel-profile/SectionCard";

type ValueAuditSectionProps = {
  buckets: AudienceBucket[];
  onUpdateBucket: (bucketId: string, updates: Partial<AudienceBucket>) => void;
};

export function ValueAuditSection({
  buckets,
  onUpdateBucket,
}: ValueAuditSectionProps) {
  return (
    <SectionCard
      title="Steps 7–10: Value audit (Identity–Emotion–Action)"
      description="For each audience bucket, define the emotion you want them to feel and the action you want them to take."
      contentClassName="space-y-4"
    >
      {buckets.map((bucket, index) => {
        const bucketLabel =
          bucket.name?.trim() || `Audience bucket ${index + 1}`;
        return (
          <BucketCard key={`value-${bucket.id}`} title={bucketLabel}>
            <div className="grid gap-3 sm:grid-cols-2">
              <BucketField
                bucket={bucket}
                definition={bucketFieldDefinitions.valueEmotion}
                onUpdate={onUpdateBucket}
              />
              <BucketField
                bucket={bucket}
                definition={bucketFieldDefinitions.valueAction}
                onUpdate={onUpdateBucket}
              />
              <ChecklistCard
                title={checklistContent.valueSpecificity.title}
                items={checklistContent.valueSpecificity.items}
                className="p-3 sm:col-span-2"
              />
              <ChecklistCard
                title={checklistContent.valueRealism.title}
                items={checklistContent.valueRealism.items}
                className="p-3 sm:col-span-2"
              />
              <ChecklistCard
                title={checklistContent.valueRepeatability.title}
                items={checklistContent.valueRepeatability.items}
                className="p-3 sm:col-span-2"
              />
              <BucketField
                bucket={bucket}
                definition={bucketFieldDefinitions.valueNotes}
                onUpdate={onUpdateBucket}
              />
            </div>
          </BucketCard>
        );
      })}
    </SectionCard>
  );
}
