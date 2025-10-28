"""YouTube endpoints."""

from fastapi import APIRouter, HTTPException, Query, Request
from googleapiclient.errors import HttpError
from pydantic import BaseModel

router = APIRouter()


class ActivityItem(BaseModel):
    """Activity item matching frontend interface."""

    id: str
    title: str
    summary: str
    date: str
    category: str


@router.get("/videos", summary="Get YouTube channel videos")
async def get_youtube_videos(
    request: Request,
    channel_id: str = Query(..., description="YouTube channel ID"),
    max_results: int = Query(50, ge=1, le=50, description="Maximum number of videos to fetch"),
) -> list[ActivityItem]:
    """
    Fetch videos from a YouTube channel and return as activity items.

    Args:
        request: FastAPI request object (for accessing app state)
        channel_id: The YouTube channel ID to fetch videos from
        max_results: Maximum number of videos to fetch (default 50, max 50)

    Returns:
        List of activity items with video data

    Raises:
        400: Missing or invalid channel_id
        404: Channel not found
        500: YouTube API error
    """
    youtube_service = request.app.state.youtube_service

    try:
        videos = youtube_service.get_channel_videos(channel_id, max_results)

        # Convert to ActivityItem format
        activity_items = []
        for video in videos:
            # Use first 150 chars of description as summary
            summary = video["description"][:150]
            if len(video["description"]) > 150:
                summary += "..."

            activity_items.append(
                ActivityItem(
                    id=video["id"],
                    title=video["title"],
                    summary=summary or "No description available",
                    date=video["publishedAt"],
                    category="video",
                )
            )

        return activity_items

    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg.lower():
            raise HTTPException(status_code=404, detail=error_msg)
        raise HTTPException(status_code=400, detail=error_msg)

    except HttpError as e:
        raise HTTPException(status_code=500, detail=f"YouTube API error: {e}")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")
