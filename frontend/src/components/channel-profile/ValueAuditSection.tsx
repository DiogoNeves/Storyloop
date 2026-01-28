import type { AudienceBucket, ChannelProfileAdvice } from "@/api/channel";
import { BucketCard } from "@/components/channel-profile/BucketCard";
import { BucketField } from "@/components/channel-profile/BucketField";
import { ChecklistCard } from "@/components/channel-profile/ChecklistCard";
import { SectionCard } from "@/components/channel-profile/SectionCard";

type ValueAuditSectionProps = {
  advice: ChannelProfileAdvice;
  buckets: AudienceBucket[];
  onUpdateBucket: (bucketId: string, updates: Partial<AudienceBucket>) => void;
};

export function ValueAuditSection({
  advice,
  buckets,
  onUpdateBucket,
}: ValueAuditSectionProps) {
  const { bucketFields, checklists } = advice;

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
                definition={bucketFields.valueEmotion}
                onUpdate={onUpdateBucket}
              />
              <BucketField
                bucket={bucket}
                definition={bucketFields.valueAction}
                onUpdate={onUpdateBucket}
              />
              <ChecklistCard
                title={checklists.valueSpecificity.title}
                items={checklists.valueSpecificity.items}
                className="p-3 sm:col-span-2"
              />
              <ChecklistCard
                title={checklists.valueRealism.title}
                items={checklists.valueRealism.items}
                className="p-3 sm:col-span-2"
              />
              <ChecklistCard
                title={checklists.valueRepeatability.title}
                items={checklists.valueRepeatability.items}
                className="p-3 sm:col-span-2"
              />
              <BucketField
                bucket={bucket}
                definition={bucketFields.valueNotes}
                onUpdate={onUpdateBucket}
              />
            </div>
          </BucketCard>
        );
      })}
    </SectionCard>
  );
}
