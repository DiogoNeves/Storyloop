import type { AudienceBucket } from "@/api/channel";
import {
  buildBucketField,
  type BucketFieldDefinition,
} from "@/components/channel-profile/channelProfileContent";
import { ProfileField } from "@/components/channel-profile/ProfileField";

type BucketFieldProps = {
  bucket: AudienceBucket;
  definition: BucketFieldDefinition;
  onUpdate: (bucketId: string, updates: Partial<AudienceBucket>) => void;
};

export function BucketField({
  bucket,
  definition,
  onUpdate,
}: BucketFieldProps) {
  const field = buildBucketField(bucket.id, definition);

  return (
    <ProfileField
      field={field}
      value={(bucket[field.key] ?? "") as string}
      onChange={(value) =>
        onUpdate(bucket.id, {
          [field.key]: value,
        } as Partial<AudienceBucket>)
      }
    />
  );
}
