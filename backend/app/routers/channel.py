"""HTTP endpoints for the channel profile."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import ValidationError

from app.dependencies import get_user_service
from app.services.channel_profile import ChannelProfile, ChannelProfileSnapshot
from app.services.users import UserService

router = APIRouter(prefix="/channel", tags=["channel"])


@router.get("/", response_model=ChannelProfileSnapshot)
def get_channel_profile(
    user_service: UserService = Depends(get_user_service),
) -> ChannelProfileSnapshot:
    """Return the stored channel profile (if any)."""

    profile_data, updated_at = user_service.get_channel_profile()
    profile = None
    if profile_data:
        try:
            profile = ChannelProfile.model_validate(profile_data)
        except ValidationError:
            profile = None

    return ChannelProfileSnapshot(
        profile=profile,
        updated_at=updated_at.isoformat() if updated_at else None,
    )


@router.put("/", response_model=ChannelProfileSnapshot)
def update_channel_profile(
    payload: ChannelProfile,
    user_service: UserService = Depends(get_user_service),
) -> ChannelProfileSnapshot:
    """Store the channel profile payload."""

    serialized = payload.model_dump(by_alias=True)
    updated_at = user_service.upsert_channel_profile(serialized)
    return ChannelProfileSnapshot(
        profile=payload, updated_at=updated_at.isoformat()
    )
