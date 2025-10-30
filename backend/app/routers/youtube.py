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


@router.get("/metrics")
async def get_channel_metrics(
    channel: str = Query(..., min_length=1),
    oauth_token: str | None = Query(None, alias="oauthToken"),
    youtube_service: YoutubeService = Depends(get_youtube_service),
):
    """Return analytics metrics for videos from the requested channel.

    Requires OAuth2 token for YouTube Analytics API access.
    """
    try:
        # First fetch the channel videos to get video IDs and channel ID
        feed = await youtube_service.fetch_channel_videos(channel)
        video_ids = [video.id for video in feed.videos]

        if not video_ids:
            return {"metrics": []}

        # Fetch metrics
        metrics = await youtube_service.fetch_video_metrics(
            channel_id=feed.channel_id,
            video_ids=video_ids,
            oauth_token=oauth_token,
        )

        return {
            "channelId": feed.channel_id,
            "metrics": [metric.to_dict() for metric in metrics],
        }
    except YoutubeError as exc:
        raise handle_youtube_error(exc) from exc
