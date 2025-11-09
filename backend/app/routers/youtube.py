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
from app.services.youtube import YoutubeError, YoutubeService
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
):
    """Return the latest published videos for the requested channel.

    If the user is authenticated via OAuth, uses authenticated requests.
    Otherwise, falls back to API key-based requests.

    Args:
        channel: Channel identifier (handle, ID, or URL).
        video_type: Optional filter by video type ("short", "live", or "video").
    """
    try:
        feed = await youtube_service.fetch_channel_feed(
            channel,
            video_type=video_type,
            user_service=user_service,
            oauth_service=oauth_service,
        )
    except YoutubeError as exc:
        raise handle_youtube_error(exc) from exc
    return feed.to_dict()


@router.get("/videos/{video_id}")
async def get_video_detail(
    video_id: str,
    youtube_service: YoutubeService = Depends(get_youtube_service),
    user_service: UserService = Depends(get_user_service),
    oauth_service: YoutubeOAuthService | None = Depends(
        get_youtube_oauth_service_optional
    ),
):
    """Return details for a single video by ID, including transcript if available.

    If the user is authenticated via OAuth, uses authenticated requests.
    Otherwise, falls back to API key-based requests.

    Args:
        video_id: YouTube video ID.
    """
    try:
        video = await youtube_service.fetch_video_detail(
            video_id,
            user_service=user_service,
            oauth_service=oauth_service,
        )
        return video.to_dict()
    except YoutubeError as exc:
        raise handle_youtube_error(exc) from exc
