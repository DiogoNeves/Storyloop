"""Pydantic models for the channel profile experience."""

from __future__ import annotations

from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


class AudienceBucket(BaseModel):
    """Audience segment information used in the channel profile."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str | None = None
    description: str | None = None
    care_and_understanding: str | None = Field(
        default=None, alias="careAndUnderstanding"
    )
    care_and_understanding_confirmed: bool | None = Field(
        default=None, alias="careAndUnderstandingConfirmed"
    )
    other_creators_watched: str | None = Field(
        default=None, alias="otherCreatorsWatched"
    )
    personal_connection: bool | None = Field(
        default=None, alias="personalConnection"
    )
    personal_connection_notes: str | None = Field(
        default=None, alias="personalConnectionNotes"
    )
    value_emotion: str | None = Field(default=None, alias="valueEmotion")
    value_action: str | None = Field(default=None, alias="valueAction")
    value_specific: bool | None = Field(default=None, alias="valueSpecific")
    value_realistic: bool | None = Field(default=None, alias="valueRealistic")
    value_repeatable: bool | None = Field(default=None, alias="valueRepeatable")
    value_notes: str | None = Field(default=None, alias="valueNotes")


class ChannelProfile(BaseModel):
    """Serialized channel identity profile."""

    model_config = ConfigDict(populate_by_name=True)

    audience_focus: str | None = Field(default=None, alias="audienceFocus")
    audience_buckets: list[AudienceBucket] = Field(
        default_factory=list, alias="audienceBuckets"
    )
    personal_connection_confirmed: bool | None = Field(
        default=None, alias="personalConnectionConfirmed"
    )
    personal_connection_notes: str | None = Field(
        default=None, alias="personalConnectionNotes"
    )
    buckets_locked: bool | None = Field(default=None, alias="bucketsLocked")
    buckets_locked_notes: str | None = Field(
        default=None, alias="bucketsLockedNotes"
    )


class AudienceBucketPatch(BaseModel):
    """Partial update payload for an audience bucket."""

    model_config = ConfigDict(populate_by_name=True)

    id: str | None = None
    name: str | None = None
    description: str | None = None
    care_and_understanding: str | None = Field(
        default=None, alias="careAndUnderstanding"
    )
    care_and_understanding_confirmed: bool | None = Field(
        default=None, alias="careAndUnderstandingConfirmed"
    )
    other_creators_watched: str | None = Field(
        default=None, alias="otherCreatorsWatched"
    )
    personal_connection: bool | None = Field(
        default=None, alias="personalConnection"
    )
    personal_connection_notes: str | None = Field(
        default=None, alias="personalConnectionNotes"
    )
    value_emotion: str | None = Field(default=None, alias="valueEmotion")
    value_action: str | None = Field(default=None, alias="valueAction")
    value_specific: bool | None = Field(default=None, alias="valueSpecific")
    value_realistic: bool | None = Field(default=None, alias="valueRealistic")
    value_repeatable: bool | None = Field(default=None, alias="valueRepeatable")
    value_notes: str | None = Field(default=None, alias="valueNotes")


class ChannelProfilePatch(BaseModel):
    """Patch payload for selectively updating the channel profile."""

    model_config = ConfigDict(populate_by_name=True)

    audience_focus: str | None = Field(default=None, alias="audienceFocus")
    audience_buckets: list[AudienceBucketPatch] | None = Field(
        default=None, alias="audienceBuckets"
    )
    personal_connection_confirmed: bool | None = Field(
        default=None, alias="personalConnectionConfirmed"
    )
    personal_connection_notes: str | None = Field(
        default=None, alias="personalConnectionNotes"
    )
    buckets_locked: bool | None = Field(default=None, alias="bucketsLocked")
    buckets_locked_notes: str | None = Field(
        default=None, alias="bucketsLockedNotes"
    )
    remove_bucket_ids: list[str] | None = Field(
        default=None, alias="removeBucketIds"
    )


def apply_channel_profile_patch(
    current: ChannelProfile | None, patch: ChannelProfilePatch
) -> ChannelProfile:
    """Merge a patch into the stored channel profile."""

    base_profile = current or ChannelProfile()
    base_data = base_profile.model_dump(by_alias=True)
    patch_data = patch.model_dump(by_alias=True, exclude_unset=True)

    remove_ids = set(patch_data.pop("removeBucketIds", []) or [])
    bucket_patches = patch_data.pop("audienceBuckets", None)

    existing_buckets: list[dict[str, object]] = base_data.get(
        "audienceBuckets", []
    )
    bucket_map = {
        bucket["id"]: bucket for bucket in existing_buckets if bucket.get("id")
    }

    for bucket_id in remove_ids:
        bucket_map.pop(bucket_id, None)

    if bucket_patches is not None:
        new_bucket_ids: list[str] = []
        for bucket_patch in bucket_patches:
            bucket_id = bucket_patch.get("id") or str(uuid4())
            if bucket_id not in bucket_map:
                bucket_map[bucket_id] = {"id": bucket_id}
                new_bucket_ids.append(bucket_id)
            bucket_map[bucket_id] = {
                **bucket_map[bucket_id],
                **bucket_patch,
                "id": bucket_id,
            }

        ordered_buckets: list[dict[str, object]] = []
        seen_ids = set()
        for bucket in existing_buckets:
            bucket_id = bucket.get("id")
            if bucket_id in bucket_map and bucket_id not in seen_ids:
                ordered_buckets.append(bucket_map[bucket_id])
                seen_ids.add(bucket_id)
        for bucket_id in new_bucket_ids:
            if bucket_id in bucket_map and bucket_id not in seen_ids:
                ordered_buckets.append(bucket_map[bucket_id])
                seen_ids.add(bucket_id)

        base_data["audienceBuckets"] = ordered_buckets
    elif remove_ids:
        base_data["audienceBuckets"] = [
            bucket
            for bucket in existing_buckets
            if bucket.get("id") not in remove_ids
        ]

    for key, value in patch_data.items():
        base_data[key] = value

    return ChannelProfile.model_validate(base_data)


class ChannelProfileSnapshot(BaseModel):
    """Channel profile + last update timestamp."""

    model_config = ConfigDict(populate_by_name=True)

    profile: ChannelProfile | None = None
    updated_at: str | None = Field(default=None, alias="updatedAt")
