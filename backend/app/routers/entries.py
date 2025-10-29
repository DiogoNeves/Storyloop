"""HTTP endpoints for managing Storyloop entries."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..services import EntryRecord, EntryService

router = APIRouter(prefix="/entries", tags=["entries"])


class EntryCreate(BaseModel):
    """Payload for creating or updating an activity entry."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    summary: str = Field(min_length=1)
    occurred_at: datetime = Field(alias="date")
    category: Literal["video", "insight", "journal"] = "journal"
    link_url: str | None = Field(default=None, alias="linkUrl")
    thumbnail_url: str | None = Field(default=None, alias="thumbnailUrl")

    @field_validator("title", "summary", mode="after")
    @classmethod
    def _strip_and_validate(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be empty or whitespace")
        return stripped


class EntryResponse(BaseModel):
    """Serialized representation of an activity entry."""

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    id: str
    title: str
    summary: str
    occurred_at: datetime = Field(alias="date")
    category: Literal["video", "insight", "journal"]
    link_url: str | None = Field(default=None, alias="linkUrl")
    thumbnail_url: str | None = Field(default=None, alias="thumbnailUrl")

    @classmethod
    def from_record(cls, record: EntryRecord) -> "EntryResponse":
        return cls.model_validate(
            {
                "id": record.id,
                "title": record.title,
                "summary": record.summary,
                "occurred_at": record.occurred_at,
                "category": record.category,
                "link_url": record.link_url,
                "thumbnail_url": record.thumbnail_url,
            }
        )


@router.get("/", response_model=list[EntryResponse])
def list_entries(request: Request) -> list[EntryResponse]:
    """Return all persisted activity entries ordered by recency."""
    entry_service: EntryService = request.app.state.entry_service
    records = entry_service.list_entries()
    return [EntryResponse.from_record(record) for record in records]


@router.post("/", response_model=list[EntryResponse])
def save_entries(request: Request, entries: list[EntryCreate]) -> list[EntryResponse]:
    """Persist provided entries, returning only the newly stored items."""
    entry_service: EntryService = request.app.state.entry_service
    records = [
        EntryRecord(
            id=entry.id,
            title=entry.title,
            summary=entry.summary,
            occurred_at=entry.occurred_at,
            category=entry.category,
            link_url=entry.link_url,
            thumbnail_url=entry.thumbnail_url,
        )
        for entry in entries
    ]
    saved = entry_service.save_new_entries(records)
    return [EntryResponse.from_record(record) for record in saved]
