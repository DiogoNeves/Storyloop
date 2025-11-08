"""YouTube video and channel classification utilities.

This module provides reusable helpers for extracting and classifying YouTube
video and channel data from API responses.
"""

from __future__ import annotations

import logging
from typing import Any, Literal

from app.utils.datetime import parse_duration_seconds

logger = logging.getLogger(__name__)


def choose_thumbnail(
    thumbnails: Any, preferred_order: tuple[str, ...] = ("high", "medium", "default")
) -> str | None:
    """Return the best available thumbnail URL from a thumbnails payload.

    Args:
        thumbnails: Thumbnails dict from YouTube API response
        preferred_order: Ordered tuple of thumbnail size preferences

    Returns:
        Thumbnail URL string, or None if no valid thumbnail found
    """
    if not isinstance(thumbnails, dict):
        return None
    for key in preferred_order:
        candidate = thumbnails.get(key)
        if isinstance(candidate, dict):
            url = candidate.get("url")
            if isinstance(url, str) and url:
                return url
    return None


def classify_video_type(
    content_details: dict[str, Any] | None,
    file_details: dict[str, Any] | None,
    live_broadcast_content: str | None = None,
) -> Literal["short", "live", "video"]:
    """Classify a YouTube video as short, live, or regular video.

    Classification logic:
    1. If live_broadcast_content indicates live/upcoming -> "live"
    2. If duration <= 180 seconds -> "short" (YouTube Shorts threshold)
    3. If file_details available and aspect ratio is vertical/square -> "short"
    4. Otherwise -> "video"

    Args:
        content_details: ContentDetails dict from YouTube API (contains duration)
        file_details: FileDetails dict from YouTube API (contains videoStreams)
        live_broadcast_content: Live broadcast status from snippet ("live", "upcoming", "none")

    Returns:
        Video type classification: "short", "live", or "video"
    """
    # Check for live broadcasts first
    if live_broadcast_content in ("live", "upcoming"):
        return "live"

    # Check duration-based classification
    duration_str = (
        content_details.get("duration") if isinstance(content_details, dict) else None
    )
    duration_seconds = parse_duration_seconds(duration_str)
    if duration_seconds is not None and duration_seconds <= 180:
        return "short"

    # Check aspect ratio from file details (most reliable for Shorts)
    if isinstance(file_details, dict):
        video_streams = file_details.get("videoStreams", [])
        if isinstance(video_streams, list) and len(video_streams) > 0:
            stream = video_streams[0]
            if isinstance(stream, dict):
                width = stream.get("widthPixels", 0)
                height = stream.get("heightPixels", 0)
                if width and height:
                    # Long-form videos are horizontal (width > height)
                    # Shorts are vertical (height > width) or square (height == width)
                    if height >= width:
                        return "short"

    # Default to regular video
    return "video"


def extract_channel_fields(channel_item: dict[str, Any]) -> dict[str, Any] | None:
    """Extract channel fields matching UserRecord schema from API response.

    Extracts:
    - channel_id
    - channel_title
    - channel_url (prefers custom URL, falls back to channel ID URL)
    - channel_thumbnail_url
    - channel_updated_at (uses publishedAt as closest available timestamp)

    Args:
        channel_item: Single item from channels().list() API response

    Returns:
        Dictionary with extracted fields, or None if channel_id missing
    """
    channel_id = channel_item.get("id")
    if not isinstance(channel_id, str) or not channel_id:
        logger.warning("Channel item missing id: %s", channel_item)
        return None

    snippet = channel_item.get("snippet", {})
    if not isinstance(snippet, dict):
        snippet = {}

    channel_title = snippet.get("title")

    # Build channel URL - prefer custom URL if available
    custom_url = snippet.get("customUrl")
    if custom_url:
        channel_url = f"https://www.youtube.com/@{custom_url.lstrip('@')}"
    else:
        channel_url = f"https://www.youtube.com/channel/{channel_id}"

    # Get thumbnail URL
    thumbnails = snippet.get("thumbnails", {})
    channel_thumbnail_url = choose_thumbnail(thumbnails)

    # Use publishedAt as channel_updated_at (closest available timestamp)
    published_at_str = snippet.get("publishedAt")
    channel_updated_at = None
    if published_at_str:
        try:
            from datetime import datetime

            channel_updated_at = datetime.fromisoformat(
                published_at_str.replace("Z", "+00:00")
            )
        except (ValueError, AttributeError):
            logger.debug("Could not parse publishedAt: %s", published_at_str)

    return {
        "channel_id": channel_id,
        "channel_title": channel_title,
        "channel_url": channel_url,
        "channel_thumbnail_url": channel_thumbnail_url,
        "channel_updated_at": channel_updated_at,
    }

