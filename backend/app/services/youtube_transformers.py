"""Pure transformation helpers for YouTube API payloads."""

from __future__ import annotations

from typing import Any

from app.services.youtube_models import YoutubeVideo, YoutubeVideoStatistics


class VideoDetailParseError(ValueError):
    """Raised when a `videos.list` payload cannot be converted to `YoutubeVideo`."""


def extract_video_ids(playlist_items: list[dict[str, Any]]) -> list[str]:
    """Extract video IDs from playlist items."""
    video_ids: list[str] = []
    for item in playlist_items:
        if not isinstance(item, dict):
            continue
        snippet = item.get("snippet", {})
        resource = snippet.get("resourceId", {}) if isinstance(snippet, dict) else {}
        video_id = resource.get("videoId") if isinstance(resource, dict) else None
        if isinstance(video_id, str) and video_id:
            video_ids.append(video_id)
    return video_ids


def extract_from_video_payload(
    video_payload: dict[str, Any],
    *,
    parent_key: str,
    child_key: str,
    default: Any,
) -> dict[str, Any]:
    """Extract a nested field from each item in a `videos.list` payload."""
    result: dict[str, Any] = {}
    video_items = video_payload.get("items", [])
    if not isinstance(video_items, list):
        return result

    for video_item in video_items:
        if not isinstance(video_item, dict):
            continue
        video_id = video_item.get("id")
        parent = video_item.get(parent_key, {})
        value = parent.get(child_key, default) if isinstance(parent, dict) else default
        if isinstance(video_id, str) and video_id:
            result[video_id] = value
    return result


def extract_durations_from_payload(
    video_payload: dict[str, Any],
) -> dict[str, str | None]:
    return extract_from_video_payload(
        video_payload,
        parent_key="contentDetails",
        child_key="duration",
        default=None,
    )


def extract_live_broadcast_content_from_payload(
    video_payload: dict[str, Any],
) -> dict[str, str]:
    return extract_from_video_payload(
        video_payload,
        parent_key="snippet",
        child_key="liveBroadcastContent",
        default="none",
    )


def extract_privacy_status_from_payload(
    video_payload: dict[str, Any],
) -> dict[str, str]:
    return extract_from_video_payload(
        video_payload,
        parent_key="status",
        child_key="privacyStatus",
        default="public",
    )


def build_videos_with_details(
    playlist_items: list[dict[str, Any]],
    durations: dict[str, str | None],
    live_content: dict[str, str],
    privacy_status: dict[str, str],
) -> list[YoutubeVideo]:
    """Build videos from playlist items plus per-video metadata maps."""
    videos: list[YoutubeVideo] = []
    for item in playlist_items:
        if not isinstance(item, dict):
            continue

        snippet = item.get("snippet")
        if not isinstance(snippet, dict):
            continue
        resource = snippet.get("resourceId")
        if not isinstance(resource, dict):
            continue

        video_id = resource.get("videoId")
        if not isinstance(video_id, str) or not video_id:
            continue

        enriched_snippet = dict(snippet)
        if video_id in live_content:
            enriched_snippet["liveBroadcastContent"] = live_content[video_id]
        if video_id in privacy_status:
            enriched_snippet["privacyStatus"] = privacy_status[video_id]

        content_details = item.get("contentDetails")
        enriched_content_details = (
            dict(content_details) if isinstance(content_details, dict) else {}
        )
        enriched_content_details["duration"] = durations.get(video_id)

        enriched_item: dict[str, Any] = {
            **item,
            "snippet": enriched_snippet,
            "contentDetails": enriched_content_details,
        }
        video = YoutubeVideo.from_playlist_item(enriched_item)
        if video is not None:
            videos.append(video)
    return videos


def filter_and_sort_videos(
    videos: list[YoutubeVideo], *, video_type: str | None
) -> list[YoutubeVideo]:
    filtered = (
        [video for video in videos if video.video_type == video_type]
        if video_type
        else list(videos)
    )
    filtered.sort(key=lambda video: video.published_at, reverse=True)
    return filtered


def parse_video_detail_response(
    items: list[Any], video_id: str
) -> YoutubeVideo:
    """Parse a single video details response from `videos.list` payload items."""
    if not isinstance(items, list) or not items:
        raise VideoDetailParseError(f"Video {video_id} not found")

    video_item = next(
        (
            item
            for item in items
            if isinstance(item, dict) and item.get("id") == video_id
        ),
        None,
    )
    if not isinstance(video_item, dict):
        raise VideoDetailParseError(f"Video {video_id} not found")

    snippet = video_item.get("snippet", {})
    content_details = video_item.get("contentDetails", {})
    status = video_item.get("status", {})
    statistics_data = video_item.get("statistics", {})

    playlist_item_like = {
        "snippet": {
            **(snippet if isinstance(snippet, dict) else {}),
            "resourceId": {"videoId": video_id},
            "liveBroadcastContent": (
                snippet.get("liveBroadcastContent", "none")
                if isinstance(snippet, dict)
                else "none"
            ),
            "privacyStatus": (
                status.get("privacyStatus", "public")
                if isinstance(status, dict)
                else "public"
            ),
        },
        "contentDetails": content_details if isinstance(content_details, dict) else {},
    }

    video = YoutubeVideo.from_playlist_item(playlist_item_like)
    if video is None:
        raise VideoDetailParseError(f"Failed to parse video {video_id}")

    video.statistics = YoutubeVideoStatistics.from_api_response(
        statistics_data if isinstance(statistics_data, dict) else None
    )
    return video
