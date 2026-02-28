"""HTTP endpoints for managing Storyloop settings."""

from __future__ import annotations

from typing import Literal
import sqlite3

import anyio
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.dependencies import (
    get_db,
    get_entry_service,
    get_smart_entry_manager,
    get_today_entry_manager,
    get_user_service,
)
from app.services.ai_runtime import refresh_runtime_ai_services
from app.services.content_export import (
    build_content_export_archive,
    load_conversation_export_records,
)
from app.services.entries import EntryService
from app.services.model_backends import (
    OllamaModelDiscoveryError,
    list_ollama_models,
)
from app.services.model_settings import (
    normalize_active_model,
    normalize_ollama_base_url,
    normalize_openai_api_key,
)
from app.services.smart_entries import SmartEntryUpdateManager
from app.services.today_entries import TodayEntryManager
from app.services.users import AccentPreference, UserService

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingsResponse(BaseModel):
    """Serialized representation of user settings."""

    model_config = ConfigDict(populate_by_name=True)

    smart_update_schedule_hours: int = Field(
        validation_alias="smartUpdateScheduleHours",
        serialization_alias="smartUpdateScheduleHours",
    )
    show_archived: bool = Field(
        validation_alias="showArchived",
        serialization_alias="showArchived",
    )
    activity_feed_sort_date: Literal["created", "modified"] = Field(
        validation_alias="activityFeedSortDate",
        serialization_alias="activityFeedSortDate",
    )
    today_entries_enabled: bool = Field(
        validation_alias="todayEntriesEnabled",
        serialization_alias="todayEntriesEnabled",
    )
    today_include_previous_incomplete: bool = Field(
        validation_alias="todayIncludePreviousIncomplete",
        serialization_alias="todayIncludePreviousIncomplete",
    )
    today_move_completed_to_end: bool = Field(
        validation_alias="todayMoveCompletedToEnd",
        serialization_alias="todayMoveCompletedToEnd",
    )
    accent_color: AccentPreference = Field(
        validation_alias="accentColor",
        serialization_alias="accentColor",
    )
    openai_key_configured: bool = Field(
        validation_alias="openaiKeyConfigured",
        serialization_alias="openaiKeyConfigured",
    )
    ollama_base_url: str = Field(
        validation_alias="ollamaBaseUrl",
        serialization_alias="ollamaBaseUrl",
    )
    active_model: str = Field(
        validation_alias="activeModel",
        serialization_alias="activeModel",
    )


class SettingsUpdate(BaseModel):
    """Payload for updating Storyloop settings."""

    model_config = ConfigDict(populate_by_name=True)

    smart_update_schedule_hours: int | None = Field(
        default=None,
        ge=1,
        validation_alias="smartUpdateScheduleHours",
        serialization_alias="smartUpdateScheduleHours",
    )
    show_archived: bool | None = Field(
        default=None,
        validation_alias="showArchived",
        serialization_alias="showArchived",
    )
    activity_feed_sort_date: Literal["created", "modified"] | None = Field(
        default=None,
        validation_alias="activityFeedSortDate",
        serialization_alias="activityFeedSortDate",
    )
    today_entries_enabled: bool | None = Field(
        default=None,
        validation_alias="todayEntriesEnabled",
        serialization_alias="todayEntriesEnabled",
    )
    today_include_previous_incomplete: bool | None = Field(
        default=None,
        validation_alias="todayIncludePreviousIncomplete",
        serialization_alias="todayIncludePreviousIncomplete",
    )
    today_move_completed_to_end: bool | None = Field(
        default=None,
        validation_alias="todayMoveCompletedToEnd",
        serialization_alias="todayMoveCompletedToEnd",
    )
    accent_color: AccentPreference | None = Field(
        default=None,
        validation_alias="accentColor",
        serialization_alias="accentColor",
    )
    openai_api_key: str | None = Field(
        default=None,
        validation_alias="openaiApiKey",
        serialization_alias="openaiApiKey",
    )
    ollama_base_url: str | None = Field(
        default=None,
        validation_alias="ollamaBaseUrl",
        serialization_alias="ollamaBaseUrl",
    )
    active_model: str | None = Field(
        default=None,
        validation_alias="activeModel",
        serialization_alias="activeModel",
    )

    @model_validator(mode="after")
    def _validate_non_empty(self) -> "SettingsUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one setting must be provided.")
        return self


class OllamaConnectRequest(BaseModel):
    """Payload for probing an Ollama endpoint."""

    model_config = ConfigDict(populate_by_name=True)

    ollama_base_url: str = Field(
        validation_alias="ollamaBaseUrl",
        serialization_alias="ollamaBaseUrl",
    )


class OllamaConnectResponse(BaseModel):
    """Response payload for Ollama connectivity checks."""

    model_config = ConfigDict(populate_by_name=True)

    ollama_base_url: str = Field(
        validation_alias="ollamaBaseUrl",
        serialization_alias="ollamaBaseUrl",
    )
    models: list[str]


@router.get("/export")
def export_content_archive(
    entry_service: EntryService = Depends(get_entry_service),
    db: sqlite3.Connection = Depends(get_db),
) -> Response:
    """Export user-created content as a zip archive of markdown files."""
    entries = entry_service.list_entries(include_archived=True)
    conversations = load_conversation_export_records(db)
    archive = build_content_export_archive(
        entries=entries,
        conversations=conversations,
    )
    return Response(
        content=archive,
        media_type="application/zip",
        headers={
            "Content-Disposition": (
                'attachment; filename="storyloop-export.zip"'
            )
        },
    )


@router.get("/", response_model=SettingsResponse)
def get_settings(
    user_service: UserService = Depends(get_user_service),
) -> SettingsResponse:
    """Return the current settings for the active user."""
    return SettingsResponse(
        smart_update_schedule_hours=user_service.get_smart_update_interval_hours(),
        show_archived=user_service.get_show_archived(),
        activity_feed_sort_date=user_service.get_activity_feed_sort_date(),
        today_entries_enabled=user_service.get_today_entries_enabled(),
        today_include_previous_incomplete=(
            user_service.get_today_include_previous_incomplete()
        ),
        today_move_completed_to_end=user_service.get_today_move_completed_to_end(),
        accent_color=user_service.get_accent_color(),
        openai_key_configured=bool(user_service.get_openai_api_key()),
        ollama_base_url=user_service.get_ollama_base_url(),
        active_model=user_service.get_active_model(),
    )


@router.post(
    "/ollama/connect",
    response_model=OllamaConnectResponse,
    status_code=status.HTTP_200_OK,
)
def connect_ollama(
    payload: OllamaConnectRequest,
    request: Request,
    user_service: UserService = Depends(get_user_service),
) -> OllamaConnectResponse:
    """Validate Ollama connectivity and return available model names."""
    try:
        normalized_base_url = normalize_ollama_base_url(payload.ollama_base_url)
        models = list_ollama_models(normalized_base_url)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except OllamaModelDiscoveryError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    user_service.set_ollama_base_url(normalized_base_url)
    refresh_runtime_ai_services(request.app, user_service=user_service)
    return OllamaConnectResponse(
        ollama_base_url=normalized_base_url,
        models=models,
    )


@router.put("/", response_model=SettingsResponse)
async def update_settings(
    payload: SettingsUpdate,
    request: Request,
    user_service: UserService = Depends(get_user_service),
    smart_entry_manager: SmartEntryUpdateManager = Depends(get_smart_entry_manager),
    today_entry_manager: TodayEntryManager = Depends(get_today_entry_manager),
) -> SettingsResponse:
    """Update settings and trigger smart journal refresh if needed."""
    current_hours = user_service.get_smart_update_interval_hours()
    current_show_archived = user_service.get_show_archived()
    current_sort_date = user_service.get_activity_feed_sort_date()
    current_today_enabled = user_service.get_today_entries_enabled()
    current_today_include_previous = (
        user_service.get_today_include_previous_incomplete()
    )
    current_today_move_completed_to_end = (
        user_service.get_today_move_completed_to_end()
    )
    current_accent_color = user_service.get_accent_color()
    current_openai_api_key = user_service.get_openai_api_key()
    current_ollama_base_url = user_service.get_ollama_base_url()
    current_active_model = user_service.get_active_model()

    next_hours = (
        payload.smart_update_schedule_hours
        if payload.smart_update_schedule_hours is not None
        else current_hours
    )
    next_show_archived = (
        payload.show_archived
        if payload.show_archived is not None
        else current_show_archived
    )
    next_sort_date = (
        payload.activity_feed_sort_date
        if payload.activity_feed_sort_date is not None
        else current_sort_date
    )
    next_today_enabled = (
        payload.today_entries_enabled
        if payload.today_entries_enabled is not None
        else current_today_enabled
    )
    next_today_include_previous = (
        payload.today_include_previous_incomplete
        if payload.today_include_previous_incomplete is not None
        else current_today_include_previous
    )
    next_today_move_completed_to_end = (
        payload.today_move_completed_to_end
        if payload.today_move_completed_to_end is not None
        else current_today_move_completed_to_end
    )
    next_accent_color = (
        payload.accent_color
        if payload.accent_color is not None
        else current_accent_color
    )
    next_openai_api_key = (
        payload.openai_api_key
        if "openai_api_key" in payload.model_fields_set
        else current_openai_api_key
    )
    next_ollama_base_url = (
        payload.ollama_base_url
        if "ollama_base_url" in payload.model_fields_set
        else current_ollama_base_url
    )
    next_active_model = (
        payload.active_model
        if "active_model" in payload.model_fields_set
        else current_active_model
    )

    try:
        normalized_openai_api_key = normalize_openai_api_key(
            next_openai_api_key
        )
        normalized_ollama_base_url = normalize_ollama_base_url(
            next_ollama_base_url
        )
        normalized_active_model = normalize_active_model(next_active_model)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    try:
        user_service.set_smart_update_interval_hours(next_hours)
        user_service.set_show_archived(next_show_archived)
        user_service.set_activity_feed_sort_date(next_sort_date)
        user_service.set_today_entries_enabled(next_today_enabled)
        user_service.set_today_include_previous_incomplete(
            next_today_include_previous
        )
        user_service.set_today_move_completed_to_end(
            next_today_move_completed_to_end
        )
        user_service.set_accent_color(next_accent_color)
        user_service.set_openai_api_key(normalized_openai_api_key)
        user_service.set_ollama_base_url(normalized_ollama_base_url)
        user_service.set_active_model(normalized_active_model)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    if current_hours != next_hours:
        await smart_entry_manager.run_due_updates()
    if not current_today_enabled and next_today_enabled:
        await anyio.to_thread.run_sync(today_entry_manager.ensure_today_entry)

    should_refresh_runtime = (
        current_openai_api_key != user_service.get_openai_api_key()
        or current_ollama_base_url != user_service.get_ollama_base_url()
        or current_active_model != user_service.get_active_model()
    )
    if should_refresh_runtime:
        refresh_runtime_ai_services(request.app, user_service=user_service)

    return SettingsResponse(
        smart_update_schedule_hours=next_hours,
        show_archived=next_show_archived,
        activity_feed_sort_date=next_sort_date,
        today_entries_enabled=next_today_enabled,
        today_include_previous_incomplete=next_today_include_previous,
        today_move_completed_to_end=next_today_move_completed_to_end,
        accent_color=next_accent_color,
        openai_key_configured=bool(user_service.get_openai_api_key()),
        ollama_base_url=user_service.get_ollama_base_url(),
        active_model=user_service.get_active_model(),
    )
