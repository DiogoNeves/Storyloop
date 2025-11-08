"""HTTP endpoints for authenticated YouTube account operations."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from app.dependencies import (
    get_user_service,
    get_youtube_oauth_service,
    get_youtube_service,
)
from app.routers.errors import handle_youtube_error
from app.services.users import UserService
from app.services.youtube import YoutubeConfigurationError, YoutubeService
from app.services.youtube_account import YoutubeAccountService
from app.services.youtube_oauth import YoutubeOAuthService

router = APIRouter(prefix="/youtube/me", tags=["youtube"])


def get_youtube_account_service(
    request: Request,
) -> YoutubeAccountService:
    """Dependency to create YoutubeAccountService."""
    user_service = get_user_service(request)
    youtube_service = get_youtube_service(request)
    oauth_service = get_youtube_oauth_service(request)
    return YoutubeAccountService(
        user_service=user_service,
        youtube_service=youtube_service,
        oauth_service=oauth_service,
    )


@router.get("/channel")
def get_my_channel(
    account_service: YoutubeAccountService = Depends(get_youtube_account_service),
    user_service: UserService = Depends(get_user_service),
) -> dict[str, Any]:
    """Return channel info for the linked account, refreshing if missing.

    Returns persisted channel data from UserRecord. If channel info is missing,
    attempts to fetch and persist it from the YouTube API.

    Returns:
        Dictionary with channel fields (id, title, url, thumbnailUrl, updatedAt)

    Raises:
        HTTPException: 401 if account not linked, 503 if OAuth not configured
    """
    record = user_service.get_active_user()
    if record is None or not record.credentials_json:
        raise HTTPException(
            status_code=401,
            detail="YouTube account not linked. Please link your account first.",
        )

    # Return persisted channel info if available
    if record.channel_id:
        return {
            "id": record.channel_id,
            "title": record.channel_title,
            "url": record.channel_url,
            "thumbnailUrl": record.channel_thumbnail_url,
            "updatedAt": record.channel_updated_at.isoformat()
            if record.channel_updated_at
            else None,
        }

    # Try to fetch and persist channel info
    try:
        channel_fields = account_service.fetch_and_persist_channel_info()
        if channel_fields is None:
            raise HTTPException(
                status_code=503,
                detail="Failed to fetch channel information from YouTube API.",
            )

        # Return the freshly fetched data
        return {
            "id": channel_fields["channel_id"],
            "title": channel_fields.get("channel_title"),
            "url": channel_fields.get("channel_url"),
            "thumbnailUrl": channel_fields.get("channel_thumbnail_url"),
            "updatedAt": (
                channel_fields["channel_updated_at"].isoformat()
                if channel_fields.get("channel_updated_at")
                else None
            ),
        }
    except YoutubeConfigurationError as exc:
        raise handle_youtube_error(exc) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Failed to fetch channel information: {exc}",
        ) from exc


@router.get("/videos")
def get_my_videos(
    account_service: YoutubeAccountService = Depends(get_youtube_account_service),
    user_service: UserService = Depends(get_user_service),
    max_results: int = 50,
) -> dict[str, Any]:
    """Return videos from the linked account's uploads playlist.

    Requires an authenticated linked account. Fetches fresh video data from
    YouTube API and returns it along with cached channel info.

    Args:
        max_results: Maximum number of videos to return (default: 50, max: 50)

    Returns:
        Dictionary with channel info and videos list

    Raises:
        HTTPException: 401 if account not linked, 503 if OAuth not configured
    """
    if max_results > 50:
        max_results = 50
    if max_results < 1:
        max_results = 1

    record = user_service.get_active_user()
    if record is None or not record.credentials_json:
        raise HTTPException(
            status_code=401,
            detail="YouTube account not linked. Please link your account first.",
        )

    try:
        videos = account_service.fetch_channel_videos(max_results=max_results)

        # Get channel info (from cache or fetch if missing)
        channel_info = None
        if record.channel_id:
            channel_info = {
                "id": record.channel_id,
                "title": record.channel_title,
                "url": record.channel_url,
                "thumbnailUrl": record.channel_thumbnail_url,
            }
        else:
            # Try to fetch channel info
            channel_fields = account_service.fetch_and_persist_channel_info()
            if channel_fields:
                channel_info = {
                    "id": channel_fields["channel_id"],
                    "title": channel_fields.get("channel_title"),
                    "url": channel_fields.get("channel_url"),
                    "thumbnailUrl": channel_fields.get("channel_thumbnail_url"),
                }

        return {
            "channel": channel_info,
            "videos": [video.to_dict() for video in videos],
        }
    except YoutubeConfigurationError as exc:
        raise handle_youtube_error(exc) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Failed to fetch videos: {exc}",
        ) from exc

