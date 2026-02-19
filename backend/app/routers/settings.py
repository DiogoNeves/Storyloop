"""HTTP endpoints for managing Storyloop settings."""

from __future__ import annotations

from typing import Literal

import anyio
from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.dependencies import (
    get_smart_entry_manager,
    get_today_entry_manager,
    get_user_service,
)
from app.services.smart_entries import SmartEntryUpdateManager
from app.services.today_entries import TodayEntryManager
from app.services.users import UserService

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

    @model_validator(mode="after")
    def _validate_non_empty(self) -> "SettingsUpdate":
        if (
            self.smart_update_schedule_hours is None
            and self.show_archived is None
            and self.activity_feed_sort_date is None
            and self.today_entries_enabled is None
            and self.today_include_previous_incomplete is None
            and self.today_move_completed_to_end is None
        ):
            raise ValueError("At least one setting must be provided.")
        return self


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
    )


@router.put("/", response_model=SettingsResponse)
async def update_settings(
    payload: SettingsUpdate,
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

    user_service.set_smart_update_interval_hours(next_hours)
    user_service.set_show_archived(next_show_archived)
    user_service.set_activity_feed_sort_date(next_sort_date)
    user_service.set_today_entries_enabled(next_today_enabled)
    user_service.set_today_include_previous_incomplete(next_today_include_previous)
    user_service.set_today_move_completed_to_end(next_today_move_completed_to_end)

    if current_hours != next_hours:
        await smart_entry_manager.run_due_updates()
    if not current_today_enabled and next_today_enabled:
        await anyio.to_thread.run_sync(today_entry_manager.ensure_today_entry)

    return SettingsResponse(
        smart_update_schedule_hours=next_hours,
        show_archived=next_show_archived,
        activity_feed_sort_date=next_sort_date,
        today_entries_enabled=next_today_enabled,
        today_include_previous_incomplete=next_today_include_previous,
        today_move_completed_to_end=next_today_move_completed_to_end,
    )
