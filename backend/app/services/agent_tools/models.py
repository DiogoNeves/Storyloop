from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class JournalEntry(BaseModel):
    """Journal entry content available to the agent."""

    id: str
    title: str
    created_at: str
    text: str
    attachments: list["JournalEntryAttachment"] = Field(default_factory=list)


class JournalEntryDetails(BaseModel):
    """Full journal entry details for edit flows."""

    id: str
    title: str
    content_markdown: str
    occurred_at: str
    content_hash: str


class JournalEntryInput(BaseModel):
    """Validated journal entry text for create/edit tools."""

    title: str
    content_markdown: str

    @field_validator("title", mode="after")
    @classmethod
    def _strip_and_validate_title(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be empty or whitespace")
        return stripped

    @field_validator("content_markdown", mode="after")
    @classmethod
    def _strip_content(cls, value: str) -> str:
        return value.strip()


class EntryDetails(BaseModel):
    """Entry details for a specific Storyloop item."""

    id: str
    title: str
    summary: str
    occurred_at: str
    category: str
    link_url: str | None = None
    thumbnail_url: str | None = None
    video_id: str | None = None


class JournalEntryAttachment(BaseModel):
    """Attachment metadata for journal entries."""

    id: str
    filename: str
    mime_type: str
    url: str
    width: int | None = None
    height: int | None = None
    extracted_text: str | None = None


class VideoDetails(BaseModel):
    """Metadata describing a YouTube video."""

    video_id: str
    title: str
    description: str
    published_at: str
    url: str
    tags: list[str] = Field(default_factory=list)


class VideoCountResult(BaseModel):
    """Count result for multi-video queries over a date range."""

    start_iso: str | None = None
    end_iso: str | None = None
    count: int
    scanned: int
    truncated: bool = False
    note: str | None = None


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
    """Analytics metrics from YouTube Analytics API."""

    video_id: str
    average_view_percentage: float | None = None
    subscribers_gained: int | None = None
    subscribers_lost: int | None = None
    views_7d: int | None = None
    views_28d: int | None = None
