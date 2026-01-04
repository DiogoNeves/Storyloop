"""HTTP endpoints for YouTube integrations."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.dependencies import YoutubeAuthDeps, get_youtube_auth_deps
from app.routers.errors import handle_youtube_error
from app.services.youtube import YoutubeError

router = APIRouter(prefix="/youtube", tags=["youtube"])


@router.get("/videos")
async def list_channel_videos(
    channel: str = Query(..., min_length=1),
    video_type: str | None = Query(default=None, alias="videoType"),
    deps: YoutubeAuthDeps = Depends(get_youtube_auth_deps),
):
    """Return the latest published videos for the requested channel.

    If the user is authenticated via OAuth, uses authenticated requests.
    Otherwise, falls back to API key-based requests.

    Args:
        channel: Channel identifier (handle, ID, or URL).
        video_type: Optional filter by video type ("short", "live", or "video").
    """
    try:
        feed = await deps.youtube_service.fetch_channel_feed(
            channel,
            video_type=video_type,
            user_service=deps.user_service,
            oauth_service=deps.oauth_service,
        )
    except YoutubeError as exc:
        raise handle_youtube_error(exc) from exc
    return feed.to_dict()


@router.get("/videos/{video_id}")
async def get_video_detail(
    video_id: str,
    deps: YoutubeAuthDeps = Depends(get_youtube_auth_deps),
):
    """Return details for a single video by ID, including transcript if available.

    If the user is authenticated via OAuth, uses authenticated requests.
    Otherwise, falls back to API key-based requests.

    Args:
        video_id: YouTube video ID.
    """
    try:
        video = await deps.youtube_service.fetch_video_detail(
            video_id,
            user_service=deps.user_service,
            oauth_service=deps.oauth_service,
        )
        # Convert to dict and add transcript field (null for now, can be extended later)
        video_dict = video.to_dict()
        video_dict["transcript"] = None
        return video_dict
    except YoutubeError as exc:
        raise handle_youtube_error(exc) from exc
