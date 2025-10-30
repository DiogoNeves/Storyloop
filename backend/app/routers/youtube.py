"""HTTP endpoints for YouTube integrations."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies import get_youtube_service
from app.services.youtube import (
    YoutubeAPIRequestError,
    YoutubeChannelNotFound,
    YoutubeConfigurationError,
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
    except (
        YoutubeConfigurationError
    ) as exc:  # pragma: no cover - configuration issue
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except YoutubeChannelNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except YoutubeAPIRequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
        ) from exc
    return feed.to_dict()
