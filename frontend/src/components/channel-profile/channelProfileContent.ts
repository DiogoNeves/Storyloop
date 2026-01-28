import type { AudienceBucket, BucketFieldDefinition } from "@/api/channel";

export const MIN_BUCKETS = 3;
export const MAX_BUCKETS = 4;

export type ResolvedBucketField = BucketFieldDefinition & {
  id: string;
  key: keyof AudienceBucket;
};

export const bucketFieldId = (bucketId: string, field: string) =>
  `bucket-${bucketId}-${field}`;

export const buildBucketField = (
  bucketId: string,
  definition: BucketFieldDefinition,
): ResolvedBucketField => ({
  ...definition,
  id: bucketFieldId(bucketId, definition.idSuffix),
});
