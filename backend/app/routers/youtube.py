"""HTTP endpoints for YouTube integrations."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.dependencies import (
    get_user_service,
    get_youtube_demo_mode,
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
    video_type: str | None = Query(default=None, alias="videoType"),
    youtube_service: YoutubeService = Depends(get_youtube_service),
    user_service: UserService = Depends(get_user_service),
    oauth_service: YoutubeOAuthService | None = Depends(
        get_youtube_oauth_service_optional
    ),
    demo_mode: bool = Depends(get_youtube_demo_mode),
):
    """Return the latest published videos for the requested channel.

    If the user is authenticated via OAuth, uses authenticated requests.
    Otherwise, falls back to API key-based requests.

    Args:
        channel: Channel identifier (handle, ID, or URL).
        video_type: Optional filter by video type ("short", "live", or "video").
    """
    try:
        # In demo mode, always use authenticated method
        # Otherwise, check if user is authenticated and OAuth service is available
        record = user_service.get_active_user()
        is_authenticated = demo_mode or (
            record is not None
            and record.credentials_json is not None
            and oauth_service is not None
        )

        if is_authenticated:
            # Use authenticated method
            # In demo mode, oauth_service may be None but demo service doesn't need it
            if demo_mode and oauth_service is None:
                # Create a dummy oauth_service for demo mode (won't be used)
                from app.services.youtube_oauth import YoutubeOAuthService
                from app.config import settings

                try:
                    oauth_service = YoutubeOAuthService(settings)
                except YoutubeConfigurationError:
                    # If OAuth isn't configured, demo service will handle it
                    # In demo mode, we can still proceed without real OAuth
                    pass

            if oauth_service is not None:
                try:
                    feed = youtube_service.fetch_authenticated_channel_videos(
                        user_service,
                        oauth_service,
                        channel_id=channel,
                        video_type=video_type,
                    )
                    return feed.to_dict()
                except YoutubeConfigurationError:
                    # If auth fails, fall back to API key method
                    pass

            # Fall through to API key method if oauth_service is None or auth failed
            feed = await youtube_service.fetch_channel_videos(
                channel, video_type=video_type
            )
        else:
            # Use API key method
            feed = await youtube_service.fetch_channel_videos(
                channel, video_type=video_type
            )
    except YoutubeError as exc:
        raise handle_youtube_error(exc) from exc
    return feed.to_dict()
