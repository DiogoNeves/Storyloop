"""Pydantic models for the channel profile experience."""

from __future__ import annotations

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


class ChannelProfileSnapshot(BaseModel):
    """Channel profile + last update timestamp."""

    model_config = ConfigDict(populate_by_name=True)

    profile: ChannelProfile | None = None
    updated_at: str | None = Field(default=None, alias="updatedAt")
