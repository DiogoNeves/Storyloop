"""YouTube Data API integration helpers."""

from __future__ import annotations

import logging
import re
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Iterable, Literal
from urllib.parse import parse_qs, urlparse

from collections.abc import AsyncIterator

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

    @classmethod
    def from_playlist_item(cls, item: dict[str, Any]) -> YoutubeVideo | None:
        """Construct a video instance from a playlistItems entry.

        Docs: https://developers.google.com/youtube/v3/docs/playlistItems/list
        """
        snippet = item.get("snippet")
        if not isinstance(snippet, dict):
            logger.warning("Skipping playlist item without snippet data: %s", item)
            return None
        resource = snippet.get("resourceId")
        if not isinstance(resource, dict):
            logger.warning(
                "Skipping playlist item without resourceId: %s", resource
            )
            return None
        video_id = resource.get("videoId")
        if not video_id:
            return None
        published_at_raw = snippet.get("publishedAt")
        try:
            published_at = _parse_datetime(published_at_raw)
        except ValueError:
            logger.warning(
                "Skipping video %s due to unparseable timestamp: %s",
                video_id,
                published_at_raw,
            )
            return None
        thumbnail_url = _select_thumbnail_url(
            snippet.get("thumbnails"),
            ("high", "medium", "standard", "default"),
        )
        return cls(
            id=video_id,
            title=snippet.get("title", "Untitled video"),
            description=snippet.get("description", ""),
            published_at=published_at,
            url=f"https://www.youtube.com/watch?v={video_id}",
            thumbnail_url=thumbnail_url,
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
        """Construct channel data from a channels API response.

        Docs: https://developers.google.com/youtube/v3/docs/channels/list
        """
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
        if not uploads_playlist_id:
            logger.warning(
                "Channel %s is missing uploads playlist information", channel_id
            )
            return None
        snippet = item.get("snippet")
        snippet_dict: dict[str, Any] = snippet if isinstance(snippet, dict) else {}
        thumbnail_url = _select_thumbnail_url(
            snippet_dict.get("thumbnails"),
            ("high", "medium", "default"),
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
        """Serialize the feed for API responses."""
        return {
            "channelId": self.channel_id,
            "channelTitle": self.channel_title,
            "channelDescription": self.channel_description,
            "channelUrl": self.channel_url,
            "channelThumbnailUrl": self.channel_thumbnail_url,
            "videos": [video.to_dict() for video in self.videos],
        }


@dataclass(slots=True)
class LookupCandidate:
    """Represents a single lookup attempt against the YouTube API."""

    endpoint: Literal["channels", "video"]
    params: dict[str, str]


@dataclass(slots=True)
class UrlIdentifierHints:
    """Structured hints extracted from a potential YouTube URL."""

    channel_ids: list[str]
    handles: list[str]
    usernames: list[str]
    video_ids: list[str]


def _clean_handle(value: str) -> str:
    """Strip the leading @ from handle-like identifiers."""
    return value[1:] if value.startswith("@") else value


def _collect_url_hints(identifier: str) -> UrlIdentifierHints | None:
    """Extract structured lookup hints from a potential YouTube URL."""
    try:
        parsed = urlparse(identifier)
    except ValueError:
        return None

    if not parsed.scheme or not parsed.netloc:
        return None

    netloc = parsed.netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    path_segments = [segment for segment in parsed.path.split("/") if segment]
    query = parse_qs(parsed.query)

    hints = UrlIdentifierHints(
        channel_ids=[],
        handles=[],
        usernames=[],
        video_ids=[],
    )

    def add_channel_id(value: str) -> None:
        trimmed = value.strip()
        if trimmed:
            hints.channel_ids.append(trimmed)

    def add_username(value: str) -> None:
        trimmed = value.strip()
        if trimmed:
            hints.usernames.append(trimmed)

    def add_handle(value: str) -> None:
        trimmed = value.strip()
        if trimmed:
            hints.handles.append(_clean_handle(trimmed))

    def add_video_id(value: str) -> None:
        trimmed = value.strip()
        if trimmed:
            hints.video_ids.append(trimmed)

    for value in query.get("channel_id", []):
        add_channel_id(value)
    for key in ("user", "c"):
        for value in query.get(key, []):
            add_username(value)
    for value in query.get("handle", []):
        add_handle(value)
    for value in query.get("v", []):
        add_video_id(value)
    for value in query.get("video_id", []):
        add_video_id(value)

    if netloc.endswith("youtu.be") and path_segments:
        add_video_id(path_segments[0])
        return hints

    if path_segments:
        first = path_segments[0]
        if first.startswith("@"):
            add_handle(first)
        elif first == "channel" and len(path_segments) > 1:
            add_channel_id(path_segments[1])
        elif first in {"user", "c"} and len(path_segments) > 1:
            username = path_segments[1]
            add_username(username)
            add_handle(username)
        elif first == "shorts" and len(path_segments) > 1:
            add_video_id(path_segments[1])
        else:
            last_segment = path_segments[-1]
            if last_segment.startswith("@"):
                add_handle(last_segment)
            elif last_segment not in {"watch", "shorts", "videos", "live"}:
                add_username(last_segment)
                add_handle(last_segment)

    return hints


def _unique_strings(values: Iterable[str]) -> list[str]:
    """Deduplicate strings while preserving order."""
    seen: set[str] = set()
    unique: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        unique.append(value)
    return unique


def _build_lookup_candidates(identifier: str) -> list[LookupCandidate]:
    """Construct ordered lookup attempts for a channel identifier."""
    cleaned = identifier.strip()
    if not cleaned:
        return []

    url_hints = _collect_url_hints(cleaned) if "://" in cleaned else None

    channel_ids: list[str] = []
    handles: list[str] = []
    usernames: list[str] = []
    video_ids: list[str] = []

    if url_hints:
        channel_ids.extend(url_hints.channel_ids)
        handles.extend(url_hints.handles)
        usernames.extend(url_hints.usernames)
        video_ids.extend(url_hints.video_ids)

    if CHANNEL_ID_PATTERN.fullmatch(cleaned):
        channel_ids.insert(0, cleaned)
    elif not url_hints:
        if cleaned.startswith("@"):
            handles.append(_clean_handle(cleaned))
        else:
            handles.append(_clean_handle(cleaned))
            usernames.append(cleaned)

    channel_candidates: list[dict[str, str]] = []
    for channel_id in _unique_strings(channel_ids):
        channel_candidates.append({"id": channel_id})
    for handle in _unique_strings(handles):
        channel_candidates.append({"forHandle": handle})
    for username in _unique_strings(usernames):
        channel_candidates.append({"forUsername": username})

    candidates: list[LookupCandidate] = [
        LookupCandidate(endpoint="channels", params=params)
        for params in _unique_dicts(channel_candidates)
    ]

    seen_video_ids: set[str] = set()
    for video_id in video_ids:
        video_id = video_id.strip()
        if not video_id or video_id in seen_video_ids:
            continue
        seen_video_ids.add(video_id)
        candidates.append(
            LookupCandidate(endpoint="video", params={"id": video_id})
        )

    return candidates


class YoutubeService:
    """High-level operations for interacting with the YouTube Data API."""

    def __init__(
        self,
        *,
        api_key: str | None,
        transport: httpx.AsyncBaseTransport | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.api_key = api_key
        self._transport = transport
        self._client = client
        if self._client is not None and transport is not None:
            logger.debug(
                "YoutubeService initialised with both custom client and transport; "
                "custom client will take precedence."
            )

    def _create_client(self) -> httpx.AsyncClient:
        """Instantiate an HTTP client for YouTube API calls."""
        return httpx.AsyncClient(
            base_url=YOUTUBE_API_BASE_URL,
            timeout=DEFAULT_TIMEOUT,
            transport=self._transport,
        )

    @asynccontextmanager
    async def client_session(self) -> AsyncIterator[httpx.AsyncClient]:
        """Yield a reusable HTTP client, creating one when needed."""
        if self._client is not None:
            yield self._client
            return
        async with self._create_client() as client:
            yield client

    async def fetch_channel_videos(
        self, identifier: str, *, max_results: int = 50
    ) -> YoutubeFeed:
        """Return recent uploads for the provided channel identifier."""
        if not self.api_key:
            raise YoutubeConfigurationError("YouTube API key not configured")

        trimmed_identifier = identifier.strip()
        if not trimmed_identifier:
            raise YoutubeChannelNotFound(
                "Provide a channel handle, link, or ID"
            )

        async with self.client_session() as client:
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
        for candidate in _build_lookup_candidates(identifier):
            if candidate.endpoint == "channels":
                channel = await self._try_resolve_channel(
                    client, candidate.params
                )
            elif candidate.endpoint == "video":
                channel = await self._resolve_channel_from_video(
                    client, candidate.params["id"]
                )
            else:  # pragma: no cover - defensive
                continue
            if channel is not None:
                return channel

        channel = await self._resolve_channel_via_search(client, identifier)
        if channel is not None:
            return channel

        raise YoutubeChannelNotFound(
            "Unable to locate a channel for the supplied identifier"
        )

    async def _resolve_channel_from_video(
        self, client: httpx.AsyncClient, video_id: str
    ) -> YoutubeChannel | None:
        """Resolve a channel by first looking up a video ID.

        Docs: https://developers.google.com/youtube/v3/docs/videos/list
        """
        if not video_id:
            return None
        params = {
            "part": "snippet",
            "id": video_id,
            "maxResults": 1,
            "key": self.api_key,
        }
        payload = await self._request_json(client, "videos", params)
        items = payload.get("items", [])
        if not isinstance(items, list) or not items:
            return None
        snippet = items[0].get("snippet", {})
        channel_id = snippet.get("channelId") if isinstance(snippet, dict) else None
        if not channel_id:
            logger.debug("Video %s did not include a channelId", video_id)
            return None
        return await self._try_resolve_channel(client, {"id": channel_id})

    async def _resolve_channel_via_search(
        self, client: httpx.AsyncClient, identifier: str
    ) -> YoutubeChannel | None:
        """Fallback: search for a channel using the free-form identifier.

        Docs: https://developers.google.com/youtube/v3/docs/search/list
        """
        search_params = {
            "part": "snippet",
            "type": "channel",
            "maxResults": 1,
            "q": identifier,
            "key": self.api_key,
        }
        payload = await self._request_json(client, "search", search_params)
        items = payload.get("items", [])
        if not isinstance(items, list) or not items:
            return None
        channel_id = (
            items[0].get("id", {}).get("channelId")
            if isinstance(items[0], dict)
            else None
        )
        if not channel_id:
            return None
        return await self._try_resolve_channel(client, {"id": channel_id})

    async def _try_resolve_channel(
        self, client: httpx.AsyncClient, params: dict[str, str]
    ) -> YoutubeChannel | None:
        """Attempt to resolve a channel with the provided parameter set.

        Docs: https://developers.google.com/youtube/v3/docs/channels/list
        """
        channel_params = {
            "part": "snippet,contentDetails",
            "maxResults": 1,
            "key": self.api_key,
            **params,
        }
        payload = await self._request_json(client, "channels", channel_params)
        items = payload.get("items", [])
        if not isinstance(items, list):
            return None
        for item in items:
            if not isinstance(item, dict):
                continue
            channel = YoutubeChannel.from_api_item(item)
            if channel is not None:
                return channel
        return None

    async def _fetch_videos(
        self,
        client: httpx.AsyncClient,
        playlist_id: str,
        *,
        max_results: int,
    ) -> list[YoutubeVideo]:
        """Fetch uploads from the channel's uploads playlist.

        Docs: https://developers.google.com/youtube/v3/docs/playlistItems/list
        """
        if max_results <= 0:
            return []

        videos: list[YoutubeVideo] = []
        remaining = max_results
        base_params = {
            "part": "snippet,contentDetails",
            "playlistId": playlist_id,
            "key": self.api_key,
        }
        page_token: str | None = None

        while remaining > 0:
            params = dict(base_params)
            params["maxResults"] = min(MAX_RESULTS_CAP, remaining)
            if page_token:
                params["pageToken"] = page_token
            payload = await self._request_json(client, "playlistItems", params)
            items = payload.get("items", [])
            if not isinstance(items, list) or not items:
                break

            for item in items:
                if not isinstance(item, dict):
                    continue
                video = YoutubeVideo.from_playlist_item(item)
                if video is None:
                    continue
                videos.append(video)
                remaining -= 1
                if remaining == 0:
                    break

            page_token = payload.get("nextPageToken")
            if not page_token:
                break

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
        try:
            data = response.json()
        except ValueError as exc:
            message = f"YouTube API returned invalid JSON for {endpoint}"
            raise YoutubeAPIRequestError(message) from exc
        if not isinstance(data, dict):
            message = f"YouTube API returned unexpected payload for {endpoint}"
            raise YoutubeAPIRequestError(message)
        return data


def _select_thumbnail_url(
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
