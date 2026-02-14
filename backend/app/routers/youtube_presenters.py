"""Pure presenters for YouTube router responses."""

from __future__ import annotations

from typing import Any

from app.services.youtube import YoutubeFeed, YoutubeVideo


def present_channel_feed(feed: YoutubeFeed) -> dict[str, Any]:
    """Convert a feed domain model to API response shape."""
    return feed.to_dict()


def present_video_detail(video: YoutubeVideo) -> dict[str, Any]:
    """Convert a video domain model to API response shape."""
    payload = video.to_dict()
    payload["transcript"] = None
    return payload
