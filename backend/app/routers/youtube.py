"""HTTP endpoints for YouTube integrations."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.dependencies import (
    get_user_service,
    get_youtube_oauth_service_optional,
    get_youtube_service,
)
from app.routers.errors import handle_youtube_error
from app.services.users import UserService
from app.services.youtube import (
    YoutubeConfigurationError,
    YoutubeError,
    YoutubeService,
)
from app.services.youtube_oauth import YoutubeOAuthService

router = APIRouter(prefix="/youtube", tags=["youtube"])


@router.get("/videos")
async def list_channel_videos(
    channel: str = Query(..., min_length=1),
    youtube_service: YoutubeService = Depends(get_youtube_service),
    user_service: UserService = Depends(get_user_service),
    oauth_service: YoutubeOAuthService | None = Depends(
        get_youtube_oauth_service_optional
    ),
):
    """Return the latest published videos for the requested channel.

    If the user is authenticated via OAuth, uses authenticated requests.
    Otherwise, falls back to API key-based requests.
    """
    try:
        # Check if user is authenticated and OAuth service is available
        record = user_service.get_active_user()
        is_authenticated = (
            record is not None
            and record.credentials_json is not None
            and oauth_service is not None
        )

        if is_authenticated:
            # Use authenticated method
            try:
                feed = youtube_service.fetch_authenticated_channel_videos(
                    user_service,
                    oauth_service,
                    channel_id=channel,
                )
            except YoutubeConfigurationError:
                # If auth fails, fall back to API key method
                feed = await youtube_service.fetch_channel_videos(channel)
        else:
            # Use API key method
            feed = await youtube_service.fetch_channel_videos(channel)
    except YoutubeError as exc:
        raise handle_youtube_error(exc) from exc
    return feed.to_dict()
