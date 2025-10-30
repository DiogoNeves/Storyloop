"""HTTP endpoints for managing Storyloop entries."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response

from app.routers.errors import ensure_exists
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.dependencies import get_entry_service
from app.services import EntryRecord, EntryService

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
    video_id: str | None = Field(default=None, alias="videoId")

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
    video_id: str | None = Field(default=None, alias="videoId")

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
                "video_id": record.video_id,
            }
        )


class EntryUpdate(BaseModel):
    """Payload for partially updating an entry."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    title: str | None = None
    summary: str | None = None
    occurred_at: datetime | None = Field(default=None, alias="date")
    category: Literal["video", "insight", "journal"] | None = None
    link_url: str | None = Field(default=None, alias="linkUrl")
    thumbnail_url: str | None = Field(default=None, alias="thumbnailUrl")
    video_id: str | None = Field(default=None, alias="videoId")

    @field_validator("title", "summary", mode="after")
    @classmethod
    def _strip_optional(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be empty or whitespace")
        return stripped


def _create_to_record(entry: EntryCreate) -> EntryRecord:
    """Convert EntryCreate Pydantic model to EntryRecord.

    Pure function that transforms API models to domain models.
    """
    return EntryRecord(
        id=entry.id,
        title=entry.title,
        summary=entry.summary,
        occurred_at=entry.occurred_at,
        category=entry.category,
        link_url=entry.link_url,
        thumbnail_url=entry.thumbnail_url,
        video_id=entry.video_id,
    )


def _update_record(current: EntryRecord, updates: EntryUpdate) -> EntryRecord:
    """Merge EntryUpdate into EntryRecord, returning a new EntryRecord.

    Pure function that combines current record with partial updates.
    """
    update_dict = updates.model_dump(exclude_unset=True)
    return EntryRecord(
        id=current.id,
        title=update_dict.get("title", current.title),
        summary=update_dict.get("summary", current.summary),
        occurred_at=update_dict.get("occurred_at", current.occurred_at),
        category=update_dict.get("category", current.category),
        link_url=update_dict.get("link_url", current.link_url),
        thumbnail_url=update_dict.get("thumbnail_url", current.thumbnail_url),
        video_id=update_dict.get("video_id", current.video_id),
    )


@router.get("/", response_model=list[EntryResponse])
def list_entries(
    entry_service: EntryService = Depends(get_entry_service),
) -> list[EntryResponse]:
    """Return all persisted activity entries ordered by recency."""
    records = entry_service.list_entries()
    return [EntryResponse.from_record(record) for record in records]


@router.post("/", response_model=list[EntryResponse])
def save_entries(
    entries: list[EntryCreate],
    entry_service: EntryService = Depends(get_entry_service),
) -> list[EntryResponse]:
    """Persist provided entries, returning only the newly stored items."""
    records = [_create_to_record(entry) for entry in entries]
    saved = entry_service.save_new_entries(records)
    return [EntryResponse.from_record(record) for record in saved]


@router.get("/{entry_id}", response_model=EntryResponse)
def get_entry(
    entry_id: str, entry_service: EntryService = Depends(get_entry_service)
) -> EntryResponse:
    """Return a single entry by identifier."""
    record = ensure_exists(
        entry_service.get_entry(entry_id),
        entity_name="Entry",
    )
    return EntryResponse.from_record(record)


@router.put("/{entry_id}", response_model=EntryResponse)
def update_entry(
    entry_id: str,
    payload: EntryUpdate,
    entry_service: EntryService = Depends(get_entry_service),
) -> EntryResponse:
    """Persist updates for an existing entry."""
    current = ensure_exists(
        entry_service.get_entry(entry_id),
        entity_name="Entry",
    )
    updated_record = _update_record(current, payload)

    updated = entry_service.update_entry(updated_record)
    if not updated:
        # The record vanished between read and write.
        raise HTTPException(status_code=404, detail="Entry not found")

    return EntryResponse.from_record(updated_record)


@router.delete("/{entry_id}", status_code=204)
def delete_entry(
    entry_id: str, entry_service: EntryService = Depends(get_entry_service)
) -> Response:
    """Delete an existing entry."""
    deleted = entry_service.delete_entry(entry_id)
    if not deleted:
        ensure_exists(None, entity_name="Entry")
    return Response(status_code=204)
