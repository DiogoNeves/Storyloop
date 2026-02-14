"""YouTube domain models and pure payload parsers."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from app.services.youtube_datetime import (
    parse_youtube_duration_seconds,
    parse_youtube_published_at,
)
from app.services.tags import extract_tags_from_values

logger = logging.getLogger(__name__)


def select_thumbnail_url(
    thumbnails: Any, preferred_order: tuple[str, ...]
) -> str | None:
    """Return the best available thumbnail URL from a thumbnails payload."""
    if not isinstance(thumbnails, dict):
        return None
    for key in preferred_order:
        candidate = thumbnails.get(key)
        if isinstance(candidate, dict):
            url = candidate.get("url")
            if isinstance(url, str) and url:
                return url
    return None


def _parse_optional_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


@dataclass(slots=True)
class YoutubeChannelStatistics:
    """Statistics for a YouTube channel."""

    view_count: int | None
    subscriber_count: int | None
    video_count: int | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "viewCount": self.view_count,
            "subscriberCount": self.subscriber_count,
            "videoCount": self.video_count,
        }

    @classmethod
    def from_api_response(
        cls, statistics: dict[str, Any] | None
    ) -> YoutubeChannelStatistics:
        if not statistics or not isinstance(statistics, dict):
            return cls(view_count=None, subscriber_count=None, video_count=None)

        hidden_subscriber_count = statistics.get("hiddenSubscriberCount", False)
        subscriber_count = (
            None
            if hidden_subscriber_count
            else _parse_optional_int(statistics.get("subscriberCount"))
        )
        return cls(
            view_count=_parse_optional_int(statistics.get("viewCount")),
            subscriber_count=subscriber_count,
            video_count=_parse_optional_int(statistics.get("videoCount")),
        )


@dataclass(slots=True)
class YoutubeVideoStatistics:
    """Statistics for a YouTube video."""

    view_count: int | None
    like_count: int | None
    comment_count: int | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "viewCount": self.view_count,
            "likeCount": self.like_count,
            "commentCount": self.comment_count,
        }

    @classmethod
    def from_api_response(
        cls, statistics: dict[str, Any] | None
    ) -> YoutubeVideoStatistics:
        if not statistics or not isinstance(statistics, dict):
            return cls(view_count=None, like_count=None, comment_count=None)
        return cls(
            view_count=_parse_optional_int(statistics.get("viewCount")),
            like_count=_parse_optional_int(statistics.get("likeCount")),
            comment_count=_parse_optional_int(statistics.get("commentCount")),
        )


@dataclass(slots=True)
class YoutubeVideo:
    """Structured representation of a YouTube video."""

    id: str
    title: str
    description: str
    published_at: datetime
    url: str
    thumbnail_url: str | None
    video_type: Literal["short", "live", "video"]
    privacy_status: str
    tags: list[str]
    statistics: YoutubeVideoStatistics | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "publishedAt": self.published_at.isoformat(),
            "url": self.url,
            "thumbnailUrl": self.thumbnail_url,
            "videoType": self.video_type,
            "privacyStatus": self.privacy_status,
            "tags": self.tags,
        }
        if self.statistics is not None:
            result["statistics"] = self.statistics.to_dict()
        return result

    @classmethod
    def from_playlist_item(cls, item: dict[str, Any]) -> YoutubeVideo | None:
        """Construct a video from a `playlistItems.list` payload item."""
        snippet = item.get("snippet")
        if not isinstance(snippet, dict):
            logger.warning("Skipping playlist item without snippet data: %s", item)
            return None

        resource = snippet.get("resourceId")
        if not isinstance(resource, dict):
            logger.warning("Skipping playlist item without resourceId: %s", resource)
            return None

        video_id = resource.get("videoId")
        if not isinstance(video_id, str) or not video_id:
            return None

        published_at_raw = snippet.get("publishedAt")
        try:
            published_at = parse_youtube_published_at(published_at_raw)
        except ValueError:
            logger.warning(
                "Skipping video %s due to unparseable timestamp: %s",
                video_id,
                published_at_raw,
            )
            return None

        thumbnail_url = select_thumbnail_url(
            snippet.get("thumbnails"), ("high", "medium", "standard", "default")
        )
        live_broadcast_content = snippet.get("liveBroadcastContent", "none")
        is_live = live_broadcast_content in ("live", "upcoming")

        content_details = item.get("contentDetails", {})
        duration_str = (
            content_details.get("duration")
            if isinstance(content_details, dict)
            else None
        )
        duration_seconds = parse_youtube_duration_seconds(duration_str)
        is_short = duration_seconds is not None and duration_seconds <= 180
        if duration_str is None:
            logger.debug(
                "Video %s missing duration; defaulting to 'video' type", video_id
            )

        privacy_status = snippet.get("privacyStatus", "public")
        if is_live:
            video_type: Literal["short", "live", "video"] = "live"
        elif is_short:
            video_type = "short"
        else:
            video_type = "video"

        title = snippet.get("title", "Untitled video")
        description = snippet.get("description", "")
        return cls(
            id=video_id,
            title=title,
            description=description,
            published_at=published_at,
            url=f"https://www.youtube.com/watch?v={video_id}",
            thumbnail_url=thumbnail_url,
            video_type=video_type,
            privacy_status=privacy_status,
            tags=extract_tags_from_values(title, description),
        )


@dataclass(slots=True)
class YoutubeChannel:
    """Channel metadata required to retrieve uploads."""

    id: str
    title: str
    description: str | None
    url: str
    uploads_playlist_id: str
    thumbnail_url: str | None

    @classmethod
    def from_api_item(cls, item: dict[str, Any]) -> YoutubeChannel | None:
        channel_id = item.get("id")
        if not isinstance(channel_id, str) or not channel_id:
            logger.warning("Encountered channel payload without id: %s", item)
            return None

        content_details = item.get("contentDetails")
        uploads_playlist_id = (
            content_details.get("relatedPlaylists", {}).get("uploads")
            if isinstance(content_details, dict)
            else None
        )
        if not isinstance(uploads_playlist_id, str) or not uploads_playlist_id:
            logger.warning(
                "Channel %s is missing uploads playlist information", channel_id
            )
            return None

        snippet = item.get("snippet")
        snippet_dict: dict[str, Any] = snippet if isinstance(snippet, dict) else {}
        thumbnail_url = select_thumbnail_url(
            snippet_dict.get("thumbnails"), ("high", "medium", "default")
        )
        return cls(
            id=channel_id,
            title=snippet_dict.get("title", "Unnamed channel"),
            description=snippet_dict.get("description"),
            url=f"https://www.youtube.com/channel/{channel_id}",
            uploads_playlist_id=uploads_playlist_id,
            thumbnail_url=thumbnail_url,
        )


@dataclass(slots=True)
class YoutubeFeed:
    """Channel metadata plus associated video uploads."""

    channel_id: str
    channel_title: str
    channel_description: str | None
    channel_url: str
    channel_thumbnail_url: str | None
    videos: list[YoutubeVideo]

    def to_dict(self) -> dict[str, Any]:
        return {
            "channelId": self.channel_id,
            "channelTitle": self.channel_title,
            "channelDescription": self.channel_description,
            "channelUrl": self.channel_url,
            "channelThumbnailUrl": self.channel_thumbnail_url,
            "videos": [video.to_dict() for video in self.videos],
        }
