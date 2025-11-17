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
