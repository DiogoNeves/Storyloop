from app.services.channel_profile import (
    AudienceBucket,
    AudienceBucketPatch,
    ChannelProfile,
    ChannelProfilePatch,
    apply_channel_profile_patch,
)


def test_patch_updates_single_field() -> None:
    current = ChannelProfile(
        audienceFocus="Old focus",
        personalConnectionNotes="Keep this",
        audienceBuckets=[],
    )
    patch = ChannelProfilePatch(audienceFocus="New focus")

    updated = apply_channel_profile_patch(current, patch)

    assert updated.audience_focus == "New focus"
    assert updated.personal_connection_notes == "Keep this"


def test_patch_merges_bucket_updates_by_id() -> None:
    current = ChannelProfile(
        audienceBuckets=[
            AudienceBucket(
                id="bucket-1",
                name="Old name",
                description="Original",
            )
        ]
    )
    patch = ChannelProfilePatch(
        audienceBuckets=[
            AudienceBucketPatch(id="bucket-1", name="New name")
        ]
    )

    updated = apply_channel_profile_patch(current, patch)

    assert updated.audience_buckets[0].id == "bucket-1"
    assert updated.audience_buckets[0].name == "New name"
    assert updated.audience_buckets[0].description == "Original"


def test_patch_adds_new_bucket_when_missing_id() -> None:
    current = ChannelProfile(
        audienceBuckets=[AudienceBucket(id="bucket-1", name="Existing")]
    )
    patch = ChannelProfilePatch(
        audienceBuckets=[AudienceBucketPatch(name="New bucket")]
    )

    updated = apply_channel_profile_patch(current, patch)

    assert len(updated.audience_buckets) == 2
    assert any(
        bucket.name == "New bucket" for bucket in updated.audience_buckets
    )


def test_patch_removes_buckets_by_id() -> None:
    current = ChannelProfile(
        audienceBuckets=[
            AudienceBucket(id="bucket-1", name="Remove me"),
            AudienceBucket(id="bucket-2", name="Keep me"),
        ]
    )
    patch = ChannelProfilePatch(removeBucketIds=["bucket-1"])

    updated = apply_channel_profile_patch(current, patch)

    assert len(updated.audience_buckets) == 1
    assert updated.audience_buckets[0].id == "bucket-2"


def test_patch_clears_field_with_null() -> None:
    current = ChannelProfile(
        audienceFocus="Old focus",
        audienceBuckets=[],
    )
    patch = ChannelProfilePatch(audienceFocus=None)

    updated = apply_channel_profile_patch(current, patch)

    assert updated.audience_focus is None
