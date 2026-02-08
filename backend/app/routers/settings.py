"""HTTP endpoints for managing Storyloop settings."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

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


class SettingsUpdate(BaseModel):
    """Payload for updating Storyloop settings."""

    model_config = ConfigDict(populate_by_name=True)

    smart_update_schedule_hours: int = Field(
        ge=1,
        validation_alias="smartUpdateScheduleHours",
        serialization_alias="smartUpdateScheduleHours",
    )


@router.get("/", response_model=SettingsResponse)
def get_settings(
    user_service: UserService = Depends(get_user_service),
) -> SettingsResponse:
    """Return the current settings for the active user."""
    return SettingsResponse(
        smart_update_schedule_hours=user_service.get_smart_update_interval_hours()
    )


@router.put("/", response_model=SettingsResponse)
async def update_settings(
    payload: SettingsUpdate,
    user_service: UserService = Depends(get_user_service),
    smart_entry_manager: SmartEntryUpdateManager = Depends(get_smart_entry_manager),
) -> SettingsResponse:
    """Update settings and trigger smart journal refresh if needed."""
    previous_hours = user_service.get_smart_update_interval_hours()
    user_service.set_smart_update_interval_hours(
        payload.smart_update_schedule_hours
    )
    if previous_hours != payload.smart_update_schedule_hours:
        await smart_entry_manager.run_due_updates()

    return SettingsResponse(
        smart_update_schedule_hours=payload.smart_update_schedule_hours
    )
