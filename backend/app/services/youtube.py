"""YouTube Data API integration helpers."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Iterable
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

YOUTUBE_API_BASE_URL = "https://www.googleapis.com/youtube/v3"
CHANNEL_ID_PATTERN = re.compile(r"^UC[0-9A-Za-z_-]{22}$")
DEFAULT_TIMEOUT = 10.0
MAX_RESULTS_CAP = 50


class YoutubeError(RuntimeError):
    """Base exception for YouTube service errors."""


class YoutubeConfigurationError(YoutubeError):
    """Raised when required configuration is missing."""


class YoutubeChannelNotFound(YoutubeError):
    """Raised when the requested channel cannot be located."""


class YoutubeAPIRequestError(YoutubeError):
    """Raised when the YouTube API responds with an unexpected error."""


@dataclass(slots=True)
class YoutubeVideo:
    """Structured representation of a YouTube video."""

    id: str
    title: str
    description: str
    published_at: datetime
    url: str
    thumbnail_url: str | None

    def to_dict(self) -> dict[str, Any]:
        """Serialize the video into a JSON-friendly dictionary."""
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "publishedAt": self.published_at.isoformat(),
            "url": self.url,
            "thumbnailUrl": self.thumbnail_url,
        }


@dataclass(slots=True)
class YoutubeChannel:
    """Channel metadata required to retrieve uploads."""

    id: str
    title: str
    description: str | None
    url: str
    uploads_playlist_id: str
    thumbnail_url: str | None


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
        """Serialize the feed for API responses."""
        return {
            "channelId": self.channel_id,
            "channelTitle": self.channel_title,
            "channelDescription": self.channel_description,
            "channelUrl": self.channel_url,
            "channelThumbnailUrl": self.channel_thumbnail_url,
            "videos": [video.to_dict() for video in self.videos],
        }


def _clean_handle(value: str) -> str:
    """Strip the leading @ from handle-like identifiers."""
    return value[1:] if value.startswith("@") else value


def _candidate_channel_params(identifier: str) -> Iterable[dict[str, str]]:
    """Yield parameter combinations for resolving a channel identifier."""

    cleaned = identifier.strip()
    if not cleaned:
        return []

    # URLs may encode handles or channel IDs in their path segments.
    if "//" in cleaned:
        parsed = urlparse(cleaned)
        path_segments = [
            segment for segment in parsed.path.split("/") if segment
        ]
        if path_segments:
            first = path_segments[0]
            if first.startswith("@"):
                yield {"forHandle": _clean_handle(first)}
            elif first == "channel" and len(path_segments) > 1:
                yield {"id": path_segments[1]}
            elif first in {"user", "c"} and len(path_segments) > 1:
                username = path_segments[1]
                yield {"forUsername": username}
                yield {"forHandle": _clean_handle(username)}
            else:
                last_segment = path_segments[-1]
                if last_segment.startswith("@"):
                    yield {"forHandle": _clean_handle(last_segment)}
                else:
                    yield {"forUsername": last_segment}
                    yield {"forHandle": _clean_handle(last_segment)}
        cleaned = path_segments[-1] if path_segments else cleaned

    if CHANNEL_ID_PATTERN.fullmatch(cleaned):
        yield {"id": cleaned}
        return

    if cleaned.startswith("@"):
        yield {"forHandle": _clean_handle(cleaned)}
    else:
        yield {"forHandle": _clean_handle(cleaned)}
        yield {"forUsername": cleaned}


class YoutubeService:
    """High-level operations for interacting with the YouTube Data API."""

    def __init__(
        self,
        *,
        api_key: str | None,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.api_key = api_key
        self._transport = transport

    def _create_client(self) -> httpx.AsyncClient:
        """Instantiate an HTTP client for YouTube API calls."""
        return httpx.AsyncClient(
            base_url=YOUTUBE_API_BASE_URL,
            timeout=DEFAULT_TIMEOUT,
            transport=self._transport,
        )

    async def fetch_channel_videos(
        self, identifier: str, *, max_results: int = 12
    ) -> YoutubeFeed:
        """Return recent uploads for the provided channel identifier."""
        if not self.api_key:
            raise YoutubeConfigurationError("YouTube API key not configured")

        trimmed_identifier = identifier.strip()
        if not trimmed_identifier:
            raise YoutubeChannelNotFound(
                "Provide a channel handle, link, or ID"
            )

        async with self._create_client() as client:
            channel = await self._resolve_channel(client, trimmed_identifier)
            videos = await self._fetch_videos(
                client, channel.uploads_playlist_id, max_results=max_results
            )

        return YoutubeFeed(
            channel_id=channel.id,
            channel_title=channel.title,
            channel_description=channel.description,
            channel_url=channel.url,
            channel_thumbnail_url=channel.thumbnail_url,
            videos=videos,
        )

    async def _resolve_channel(
        self, client: httpx.AsyncClient, identifier: str
    ) -> YoutubeChannel:
        """Identify the channel metadata for the provided identifier."""
        for params in _unique_dicts(_candidate_channel_params(identifier)):
            channel = await self._try_resolve_channel(client, params)
            if channel is not None:
                return channel

        # Final fallback: search by free-form query and resolve the first result.
        search_params = {
            "part": "snippet",
            "type": "channel",
            "maxResults": 1,
            "q": identifier,
            "key": self.api_key,
        }
        payload = await self._request_json(client, "search", search_params)
        items = payload.get("items", [])
        if items:
            channel_id = items[0].get("id", {}).get("channelId")
            if channel_id:
                channel = await self._try_resolve_channel(
                    client, {"id": channel_id}
                )
                if channel is not None:
                    return channel

        raise YoutubeChannelNotFound(
            "Unable to locate a channel for the supplied identifier"
        )

    async def _try_resolve_channel(
        self, client: httpx.AsyncClient, params: dict[str, str]
    ) -> YoutubeChannel | None:
        """Attempt to resolve a channel with the provided parameter set."""
        channel_params = {
            "part": "snippet,contentDetails",
            "maxResults": 1,
            "key": self.api_key,
            **params,
        }
        payload = await self._request_json(client, "channels", channel_params)
        items = payload.get("items", [])
        if not items:
            return None
        item = items[0]
        uploads_playlist_id = (
            item.get("contentDetails", {})
            .get("relatedPlaylists", {})
            .get("uploads")
        )
        if not uploads_playlist_id:
            logger.warning(
                "Channel %s is missing uploads playlist information",
                item.get("id"),
            )
            return None

        snippet = item.get("snippet", {})
        thumbnails = snippet.get("thumbnails", {})
        thumbnail = (
            thumbnails.get("high")
            or thumbnails.get("medium")
            or thumbnails.get("default")
            or {}
        )

        return YoutubeChannel(
            id=item.get("id", ""),
            title=snippet.get("title", "Unnamed channel"),
            description=snippet.get("description"),
            url=f"https://www.youtube.com/channel/{item.get('id', '')}",
            uploads_playlist_id=uploads_playlist_id,
            thumbnail_url=thumbnail.get("url"),
        )

    async def _fetch_videos(
        self,
        client: httpx.AsyncClient,
        playlist_id: str,
        *,
        max_results: int,
    ) -> list[YoutubeVideo]:
        """Fetch uploads from the channel's uploads playlist."""
        limited = min(max(1, max_results), MAX_RESULTS_CAP)
        params = {
            "part": "snippet,contentDetails",
            "playlistId": playlist_id,
            "maxResults": limited,
            "key": self.api_key,
        }
        payload = await self._request_json(client, "playlistItems", params)
        videos: list[YoutubeVideo] = []
        for item in payload.get("items", []):
            snippet = item.get("snippet", {})
            resource = snippet.get("resourceId", {})
            video_id = resource.get("videoId")
            if not video_id:
                continue
            published_at_raw = snippet.get("publishedAt")
            try:
                published_at = _parse_datetime(published_at_raw)
            except ValueError:
                logger.warning(
                    "Skipping video %s due to unparseable timestamp: %s",
                    video_id,
                    published_at_raw,
                )
                continue

            thumbnails = snippet.get("thumbnails", {})
            thumbnail = (
                thumbnails.get("high")
                or thumbnails.get("medium")
                or thumbnails.get("standard")
                or thumbnails.get("default")
                or {}
            )
            videos.append(
                YoutubeVideo(
                    id=video_id,
                    title=snippet.get("title", "Untitled video"),
                    description=snippet.get("description", ""),
                    published_at=published_at,
                    url=f"https://www.youtube.com/watch?v={video_id}",
                    thumbnail_url=thumbnail.get("url"),
                )
            )
        return videos

    async def _request_json(
        self, client: httpx.AsyncClient, endpoint: str, params: dict[str, Any]
    ) -> dict[str, Any]:
        """Perform a GET request against the YouTube API and decode the JSON body."""
        try:
            response = await client.get(endpoint, params=params)
            response.raise_for_status()
        except (
            httpx.HTTPStatusError
        ) as exc:  # pragma: no cover - network errors
            detail = (
                exc.response.json().get("error", {}).get("message")
                if exc.response.headers.get("content-type", "").startswith(
                    "application/json"
                )
                else exc.response.text
            )
            message = "YouTube API request failed with status %s: %s" % (
                exc.response.status_code,
                detail,
            )
            raise YoutubeAPIRequestError(message) from exc
        except httpx.RequestError as exc:  # pragma: no cover - network errors
            message = f"Error communicating with YouTube API: {exc}"
            raise YoutubeAPIRequestError(message) from exc
        data = response.json()
        return data


def _unique_dicts(candidates: Iterable[dict[str, str]]) -> list[dict[str, str]]:
    """Deduplicate dictionaries while preserving order."""
    seen: set[tuple[tuple[str, str], ...]] = set()
    unique: list[dict[str, str]] = []
    for candidate in candidates:
        key = tuple(sorted(candidate.items()))
        if key in seen:
            continue
        seen.add(key)
        unique.append(candidate)
    return unique


def _parse_datetime(value: str | None) -> datetime:
    """Parse ISO 8601 timestamps returned by the YouTube API."""
    if not value:
        raise ValueError("Timestamp missing")
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)
