"""HTTP endpoints for YouTube integrations."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_youtube_service
from app.routers.errors import handle_youtube_error
from app.services.youtube import (
    YoutubeError,
    YoutubeService,
)

router = APIRouter(prefix="/youtube", tags=["youtube"])


@router.get("/videos")
async def list_channel_videos(
    channel: str = Query(..., min_length=1),
    youtube_service: YoutubeService = Depends(get_youtube_service),
):
    """Return the latest published videos for the requested channel."""
    try:
        feed = await youtube_service.fetch_channel_videos(channel)
    except YoutubeError as exc:
        raise handle_youtube_error(exc) from exc
    return feed.to_dict()
