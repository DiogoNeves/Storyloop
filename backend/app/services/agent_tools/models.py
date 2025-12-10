from __future__ import annotations

from pydantic import BaseModel, Field


class JournalEntry(BaseModel):
    """Journal entry content available to the agent."""

    id: str
    title: str
    created_at: str
    text: str


class VideoDetails(BaseModel):
    """Metadata describing a YouTube video."""

    video_id: str
    title: str
    description: str
    url: str
    tags: list[str] = Field(default_factory=list)


class VideoMetrics(BaseModel):
    """Structured video metrics Storyloop exposes to the agent."""

    video_id: str
    view_count: int | None = None
    like_count: int | None = None
    comment_count: int | None = None
    average_view_duration_seconds: float | None = None
    notes: str | None = None


class ChannelMetrics(BaseModel):
    """Structured channel metrics Storyloop exposes to the agent."""

    channel_id: str
    view_count: int | None = None
    subscriber_count: int | None = None
    video_count: int | None = None


class VideoAnalyticsMetrics(BaseModel):
    """Analytics metrics from YouTube Analytics API for SGI calculation."""

    video_id: str
    average_view_percentage: float | None = None
    subscribers_gained: int | None = None
    subscribers_lost: int | None = None
    views_7d: int | None = None
    views_28d: int | None = None


class GrowthScoreResult(BaseModel):
    """Growth score result for agent consumption."""

    total_score: float
    score_delta: float
    is_early_channel: bool
    discovery_score: float
    retention_score: float
    loyalty_score: float
