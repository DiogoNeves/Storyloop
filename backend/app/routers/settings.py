"""HTTP endpoints for managing Storyloop settings."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.dependencies import get_smart_entry_manager, get_user_service
from app.services.smart_entries import SmartEntryUpdateManager
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

    @model_validator(mode="after")
    def _validate_non_empty(self) -> "SettingsUpdate":
        if (
            self.smart_update_schedule_hours is None
            and self.show_archived is None
            and self.activity_feed_sort_date is None
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
    )


@router.put("/", response_model=SettingsResponse)
async def update_settings(
    payload: SettingsUpdate,
    user_service: UserService = Depends(get_user_service),
    smart_entry_manager: SmartEntryUpdateManager = Depends(get_smart_entry_manager),
) -> SettingsResponse:
    """Update settings and trigger smart journal refresh if needed."""
    current_hours = user_service.get_smart_update_interval_hours()
    current_show_archived = user_service.get_show_archived()
    current_sort_date = user_service.get_activity_feed_sort_date()

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

    user_service.set_smart_update_interval_hours(next_hours)
    user_service.set_show_archived(next_show_archived)
    user_service.set_activity_feed_sort_date(next_sort_date)
    if current_hours != next_hours:
        await smart_entry_manager.run_due_updates()

    return SettingsResponse(
        smart_update_schedule_hours=next_hours,
        show_archived=next_show_archived,
        activity_feed_sort_date=next_sort_date,
    )
