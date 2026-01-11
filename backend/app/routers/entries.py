"""HTTP endpoints for managing Storyloop entries."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

import anyio
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sse_starlette.sse import EventSourceResponse

from app.routers.errors import ensure_exists
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.dependencies import get_entry_service, get_smart_entry_manager
from app.services import EntryRecord, EntryService
from app.services.smart_entries import SmartEntryUpdateManager

router = APIRouter(prefix="/entries", tags=["entries"])


class EntryCreate(BaseModel):
    """Payload for creating or updating an activity entry."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    summary: str = Field(default="")
    prompt_body: str | None = Field(default=None, alias="promptBody")
    prompt_format: str | None = Field(default=None, alias="promptFormat")
    occurred_at: datetime = Field(alias="date")
    category: Literal["content", "journal"] = "journal"
    link_url: str | None = Field(default=None, alias="linkUrl")
    thumbnail_url: str | None = Field(default=None, alias="thumbnailUrl")
    video_id: str | None = Field(default=None, alias="videoId")
    pinned: bool = False

    @field_validator("title", mode="after")
    @classmethod
    def _strip_and_validate_title(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be empty or whitespace")
        return stripped

    @field_validator("summary", mode="after")
    @classmethod
    def _strip_summary(cls, value: str) -> str:
        return value.strip()

    @field_validator("prompt_body", mode="after")
    @classmethod
    def _strip_prompt_body(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be empty or whitespace")
        return stripped

    @field_validator("prompt_format", mode="after")
    @classmethod
    def _strip_prompt_format(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @model_validator(mode="after")
    def _validate_prompt_fields(self) -> "EntryCreate":
        if self.prompt_format and not self.prompt_body:
            raise ValueError("promptBody is required when promptFormat is provided")
        return self


class EntryResponse(BaseModel):
    """Serialized representation of an activity entry."""

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    id: str
    title: str
    summary: str
    prompt_body: str | None = Field(default=None, alias="promptBody")
    prompt_format: str | None = Field(default=None, alias="promptFormat")
    occurred_at: datetime = Field(alias="date")
    updated_at: datetime = Field(alias="updatedAt")
    last_smart_update_at: datetime | None = Field(
        default=None, alias="lastSmartUpdateAt"
    )
    category: Literal["content", "journal"]
    link_url: str | None = Field(default=None, alias="linkUrl")
    thumbnail_url: str | None = Field(default=None, alias="thumbnailUrl")
    video_id: str | None = Field(default=None, alias="videoId")
    pinned: bool = False

    @classmethod
    def from_record(cls, record: EntryRecord) -> "EntryResponse":
        return cls.model_validate(
            {
                "id": record.id,
                "title": record.title,
                "summary": record.summary,
                "prompt_body": record.prompt_body,
                "prompt_format": record.prompt_format,
                "occurred_at": record.occurred_at,
                "updated_at": record.updated_at,
                "last_smart_update_at": record.last_smart_update_at,
                "category": record.category,
                "link_url": record.link_url,
                "thumbnail_url": record.thumbnail_url,
                "video_id": record.video_id,
                "pinned": record.pinned,
            }
        )


class EntryUpdate(BaseModel):
    """Payload for partially updating an entry."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    title: str | None = None
    summary: str | None = None
    prompt_body: str | None = Field(default=None, alias="promptBody")
    prompt_format: str | None = Field(default=None, alias="promptFormat")
    occurred_at: datetime | None = Field(default=None, alias="date")
    category: Literal["content", "journal"] | None = None
    link_url: str | None = Field(default=None, alias="linkUrl")
    thumbnail_url: str | None = Field(default=None, alias="thumbnailUrl")
    video_id: str | None = Field(default=None, alias="videoId")
    pinned: bool | None = None

    @field_validator("title", mode="after")
    @classmethod
    def _strip_optional_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be empty or whitespace")
        return stripped

    @field_validator("summary", mode="after")
    @classmethod
    def _strip_optional_summary(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip()

    @field_validator("prompt_body", mode="after")
    @classmethod
    def _strip_optional_prompt_body(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be empty or whitespace")
        return stripped

    @field_validator("prompt_format", mode="after")
    @classmethod
    def _strip_optional_prompt_format(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @model_validator(mode="after")
    def _validate_prompt_update(self) -> "EntryUpdate":
        if "prompt_body" in self.model_fields_set and self.prompt_body is None:
            if "prompt_format" in self.model_fields_set and self.prompt_format:
                raise ValueError(
                    "promptFormat cannot be set when clearing promptBody"
                )
        return self


def _create_to_record(entry: EntryCreate) -> EntryRecord:
    """Convert EntryCreate Pydantic model to EntryRecord.

    Pure function that transforms API models to domain models.
    """
    return EntryRecord(
        id=entry.id,
        title=entry.title,
        summary=entry.summary,
        prompt_body=entry.prompt_body,
        prompt_format=entry.prompt_format,
        occurred_at=entry.occurred_at,
        updated_at=datetime.now(tz=UTC),
        category=entry.category,
        last_smart_update_at=None,
        link_url=entry.link_url,
        thumbnail_url=entry.thumbnail_url,
        video_id=entry.video_id,
        pinned=entry.pinned,
    )


def _update_record(current: EntryRecord, updates: EntryUpdate) -> EntryRecord:
    """Merge EntryUpdate into EntryRecord, returning a new EntryRecord.

    Pure function that combines current record with partial updates.
    """
    update_dict = updates.model_dump(exclude_unset=True)
    prompt_body = current.prompt_body
    prompt_format = current.prompt_format

    if "prompt_body" in updates.model_fields_set:
        prompt_body = updates.prompt_body
        if prompt_body is None:
            prompt_format = None

    if "prompt_format" in updates.model_fields_set:
        prompt_format = updates.prompt_format

    if prompt_body is None:
        prompt_format = None

    title = update_dict.get("title")
    if title is None:
        title = current.title
    summary = update_dict.get("summary")
    if summary is None:
        summary = current.summary
    occurred_at = update_dict.get("occurred_at")
    if occurred_at is None:
        occurred_at = current.occurred_at
    category = update_dict.get("category")
    if category is None:
        category = current.category
    pinned = update_dict.get("pinned")
    if pinned is None:
        pinned = current.pinned

    return EntryRecord(
        id=current.id,
        title=title,
        summary=summary,
        prompt_body=prompt_body,
        prompt_format=prompt_format,
        occurred_at=occurred_at,
        updated_at=datetime.now(tz=UTC),
        last_smart_update_at=current.last_smart_update_at,
        category=category,
        link_url=update_dict.get("link_url", current.link_url),
        thumbnail_url=update_dict.get("thumbnail_url", current.thumbnail_url),
        video_id=update_dict.get("video_id", current.video_id),
        pinned=pinned,
    )


@router.get("/", response_model=list[EntryResponse])
def list_entries(
    entry_service: EntryService = Depends(get_entry_service),
) -> list[EntryResponse]:
    """Return all persisted activity entries ordered by recency."""
    records = entry_service.list_entries()
    return [EntryResponse.from_record(record) for record in records]


@router.post("/", response_model=list[EntryResponse])
async def save_entries(
    entries: list[EntryCreate],
    request: Request,
    entry_service: EntryService = Depends(get_entry_service),
) -> list[EntryResponse]:
    """Persist provided entries, returning only the newly stored items."""
    records = [_create_to_record(entry) for entry in entries]
    saved = await anyio.to_thread.run_sync(entry_service.save_new_entries, records)

    smart_entry_manager = getattr(request.app.state, "smart_entry_manager", None)
    if smart_entry_manager is not None:
        for record in saved:
            if record.prompt_body:
                await smart_entry_manager.start_update(record.id)

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
async def update_entry(
    entry_id: str,
    payload: EntryUpdate,
    request: Request,
    entry_service: EntryService = Depends(get_entry_service),
) -> EntryResponse:
    """Persist updates for an existing entry."""
    current = ensure_exists(
        await anyio.to_thread.run_sync(entry_service.get_entry, entry_id),
        entity_name="Entry",
    )
    updated_record = _update_record(current, payload)

    if updated_record.prompt_format and not updated_record.prompt_body:
        raise HTTPException(
            status_code=422,
            detail="promptBody is required when promptFormat is provided",
        )

    updated = await anyio.to_thread.run_sync(entry_service.update_entry, updated_record)
    if not updated:
        # The record vanished between read and write.
        raise HTTPException(status_code=404, detail="Entry not found")

    prompt_updated = (
        "prompt_body" in payload.model_fields_set
        or "prompt_format" in payload.model_fields_set
    )
    if prompt_updated and updated_record.prompt_body:
        smart_entry_manager = getattr(request.app.state, "smart_entry_manager", None)
        if smart_entry_manager is not None:
            await smart_entry_manager.start_update(updated_record.id)

    return EntryResponse.from_record(updated_record)


@router.post("/{entry_id}/smart/stream")
async def stream_smart_entry_update(
    entry_id: str,
    smart_entry_manager: SmartEntryUpdateManager = Depends(get_smart_entry_manager),
) -> EventSourceResponse:
    """Stream smart journal updates for an entry."""

    async def event_generator():
        async for event in smart_entry_manager.stream_update(entry_id):
            yield event

    return EventSourceResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


@router.delete("/{entry_id}", status_code=204)
def delete_entry(
    entry_id: str, entry_service: EntryService = Depends(get_entry_service)
) -> Response:
    """Delete an existing entry."""
    deleted = entry_service.delete_entry(entry_id)
    if not deleted:
        ensure_exists(None, entity_name="Entry")
    return Response(status_code=204)
