"""YouTube Data API integration helpers."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, Literal, Protocol, cast

from collections.abc import AsyncIterator

import anyio
import httpx
from asyncache import cachedmethod
from cachetools import TTLCache
from googleapiclient.discovery import build

from app.services.youtube_identifier import build_lookup_candidates
from app.utils.datetime import parse_datetime, parse_duration_seconds

if TYPE_CHECKING:  # pragma: no cover - imports for typing only
    from app.services.users import UserService
    from app.services.youtube_oauth import YoutubeOAuthService


class ChannelsList(Protocol):
    """Protocol for channels().list() return type."""

    def execute(self) -> dict[str, Any]:
        """Execute the API request."""
        ...


class ChannelsResource(Protocol):
    """Protocol for channels() return type."""

    def list(self, *, part: str, **kwargs: Any) -> ChannelsList:
        """List channels."""
        ...


class PlaylistItemsList(Protocol):
    """Protocol for playlistItems().list() return type."""

    def execute(self) -> dict[str, Any]:
        """Execute the API request."""
        ...


class PlaylistItemsResource(Protocol):
    """Protocol for playlistItems() return type."""

    def list(self, **kwargs: Any) -> PlaylistItemsList:
        """List playlist items."""
        ...


class VideosList(Protocol):
    """Protocol for videos().list() return type."""

    def execute(self) -> dict[str, Any]:
        """Execute the API request."""
        ...


class VideosResource(Protocol):
    """Protocol for videos() return type."""

    def list(self, **kwargs: Any) -> VideosList:
        """List videos."""
        ...


class YoutubeApiClient(Protocol):
    """Protocol for YouTube API client with dynamically generated methods."""

    def channels(self) -> ChannelsResource:
        """Access channels resource."""
        ...

    def playlistItems(self) -> PlaylistItemsResource:
        """Access playlistItems resource."""
        ...

    def videos(self) -> VideosResource:
        """Access videos resource."""
        ...


logger = logging.getLogger(__name__)

YOUTUBE_API_BASE_URL = "https://www.googleapis.com/youtube/v3"
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
class YoutubeChannelStatistics:
    """Statistics for a YouTube channel."""

    view_count: int | None
    subscriber_count: int | None
    video_count: int | None

    def to_dict(self) -> dict[str, Any]:
        """Serialize the statistics into a JSON-friendly dictionary."""
        return {
            "viewCount": self.view_count,
            "subscriberCount": self.subscriber_count,
            "videoCount": self.video_count,
        }

    @classmethod
    def from_api_response(cls, statistics: dict[str, Any] | None) -> "YoutubeChannelStatistics":
        """Construct statistics from a YouTube API statistics response."""
        if not statistics or not isinstance(statistics, dict):
            return cls(view_count=None, subscriber_count=None, video_count=None)

        def parse_int(value: Any) -> int | None:
            if value is None:
                return None
            try:
                return int(value)
            except (ValueError, TypeError):
                return None

        # Note: subscriberCount may be hidden if channel has opted out
        hidden_subscriber_count = statistics.get("hiddenSubscriberCount", False)
        subscriber_count = None if hidden_subscriber_count else parse_int(statistics.get("subscriberCount"))

        return cls(
            view_count=parse_int(statistics.get("viewCount")),
            subscriber_count=subscriber_count,
            video_count=parse_int(statistics.get("videoCount")),
        )


@dataclass(slots=True)
class YoutubeVideoStatistics:
    """Statistics for a YouTube video."""

    view_count: int | None
    like_count: int | None
    comment_count: int | None

    def to_dict(self) -> dict[str, Any]:
        """Serialize the statistics into a JSON-friendly dictionary."""
        return {
            "viewCount": self.view_count,
            "likeCount": self.like_count,
            "commentCount": self.comment_count,
        }

    @classmethod
    def from_api_response(cls, statistics: dict[str, Any] | None) -> "YoutubeVideoStatistics":
        """Construct statistics from a YouTube API statistics response."""
        if not statistics or not isinstance(statistics, dict):
            return cls(view_count=None, like_count=None, comment_count=None)

        def parse_int(value: Any) -> int | None:
            if value is None:
                return None
            try:
                return int(value)
            except (ValueError, TypeError):
                return None

        return cls(
            view_count=parse_int(statistics.get("viewCount")),
            like_count=parse_int(statistics.get("likeCount")),
            comment_count=parse_int(statistics.get("commentCount")),
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
    privacy_status: str  # "public", "unlisted", "private"
    statistics: YoutubeVideoStatistics | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize the video into a JSON-friendly dictionary."""
        result: dict[str, Any] = {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "publishedAt": self.published_at.isoformat(),
            "url": self.url,
            "thumbnailUrl": self.thumbnail_url,
            "videoType": self.video_type,
            "privacyStatus": self.privacy_status,
        }
        if self.statistics is not None:
            result["statistics"] = self.statistics.to_dict()
        return result

    @classmethod
    def from_playlist_item(cls, item: dict[str, Any]) -> YoutubeVideo | None:
        """Construct a video instance from a playlistItems entry.

        Docs: https://developers.google.com/youtube/v3/docs/playlistItems/list
        """
        snippet = item.get("snippet")
        if not isinstance(snippet, dict):
            logger.warning(
                "Skipping playlist item without snippet data: %s", item
            )
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
            published_at = parse_datetime(published_at_raw)
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

        # Extract live broadcast content from snippet
        # liveBroadcastContent can be: "live" (currently live), "upcoming" (scheduled),
        # or "none" (not live/regular video). Completed live streams become "none".
        live_broadcast_content = snippet.get("liveBroadcastContent", "none")
        is_live = live_broadcast_content in ("live", "upcoming")

        # Extract duration from contentDetails
        # Duration is fetched separately via videos.list API since playlistItems
        # doesn't include it. Duration is in ISO 8601 format (e.g., "PT3M30S").
        content_details = item.get("contentDetails", {})
        duration_str = (
            content_details.get("duration")
            if isinstance(content_details, dict)
            else None
        )
        duration_seconds = parse_duration_seconds(duration_str)

        # YouTube Shorts are videos up to 3 minutes (180 seconds) with a vertical/square aspect ratio.
        # Source: https://support.google.com/youtube/answer/15424877
        # The playlistItems response does not expose aspect ratio, so we approximate using duration.
        # Note: Live streams can also be Shorts (live Shorts), but live status takes precedence.
        is_short = duration_seconds is not None and duration_seconds <= 180

        # Log warning if duration is missing (could lead to misclassification)
        if duration_str is None:
            logger.debug(
                "Video %s missing duration; defaulting to 'video' type",
                video_id,
            )

        # Extract privacy status from snippet (added by _build_videos_with_details)
        # Defaults to "public" if not available
        privacy_status = snippet.get("privacyStatus", "public")

        # Determine video type with priority: live > short > video
        # This ensures live streams (including live Shorts) are correctly identified as "live"
        video_url = f"https://www.youtube.com/watch?v={video_id}"
        if is_live:
            video_type: Literal["short", "live", "video"] = "live"
        elif is_short:
            video_type = "short"
        else:
            video_type = "video"

        return cls(
            id=video_id,
            title=snippet.get("title", "Untitled video"),
            description=snippet.get("description", ""),
            published_at=published_at,
            url=video_url,
            thumbnail_url=thumbnail_url,
            video_type=video_type,
            privacy_status=privacy_status,
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
        snippet_dict: dict[str, Any] = (
            snippet if isinstance(snippet, dict) else {}
        )
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
        self._response_cache: TTLCache[
            tuple[str, tuple[tuple[str, Any], ...]], dict[str, Any]
        ] = TTLCache(maxsize=128, ttl=300)

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
        self,
        identifier: str,
        *,
        max_results: int = 50,
        video_type: str | None = None,
    ) -> YoutubeFeed:
        """Return recent uploads for the provided channel identifier.

        Args:
            identifier: Channel identifier (handle, ID, or URL).
            max_results: Maximum number of videos to return.
            video_type: Optional filter by video type ("short", "live", or "video").
        """
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
                client,
                channel.uploads_playlist_id,
                max_results=max_results,
                video_type=video_type,
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
        for candidate in build_lookup_candidates(identifier):
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
        channel_id = (
            snippet.get("channelId") if isinstance(snippet, dict) else None
        )
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

    async def _fetch_playlist_items_page(
        self,
        client: httpx.AsyncClient,
        playlist_id: str,
        *,
        max_results: int,
        page_token: str | None = None,
    ) -> tuple[list[dict[str, Any]], str | None]:
        """Fetch a single page of playlist items.

        Returns:
            Tuple of (items, next_page_token)

        Docs: https://developers.google.com/youtube/v3/docs/playlistItems/list
        """
        params: dict[str, Any] = {
            "part": "snippet,contentDetails",
            "playlistId": playlist_id,
            "key": self.api_key,
            "maxResults": min(MAX_RESULTS_CAP, max_results),
        }
        if page_token is not None:
            params["pageToken"] = page_token

        payload = await self._request_json(client, "playlistItems", params)
        items = payload.get("items", [])
        if not isinstance(items, list):
            items = []
        next_page_token = payload.get("nextPageToken")

        return items, next_page_token

    def _extract_video_ids(
        self, playlist_items: list[dict[str, Any]]
    ) -> list[str]:
        """Extract video IDs from playlist items."""
        video_ids: list[str] = []
        for item in playlist_items:
            if not isinstance(item, dict):
                continue
            snippet = item.get("snippet", {})
            resource = (
                snippet.get("resourceId", {})
                if isinstance(snippet, dict)
                else {}
            )
            video_id = (
                resource.get("videoId") if isinstance(resource, dict) else None
            )
            if video_id:
                video_ids.append(video_id)
        return video_ids

    def _extract_from_payload(
        self,
        video_payload: dict[str, Any],
        parent_key: str,
        child_key: str,
        default: Any = None,
    ) -> dict[str, Any]:
        """Extract a nested field from each item in a videos.list API response.

        Generic extractor that reduces duplication across extraction methods.

        Args:
            video_payload: The API response containing video items
            parent_key: The parent object key (e.g., "contentDetails", "snippet", "status")
            child_key: The child field key to extract (e.g., "duration", "liveBroadcastContent")
            default: Default value if the field is missing

        Returns:
            Dict mapping video_id to extracted value
        """
        result: dict[str, Any] = {}
        video_items = video_payload.get("items", [])
        if not isinstance(video_items, list):
            return result

        for video_item in video_items:
            if not isinstance(video_item, dict):
                continue
            video_id = video_item.get("id")
            parent = video_item.get(parent_key, {})
            value = (
                parent.get(child_key, default)
                if isinstance(parent, dict)
                else default
            )
            if video_id:
                result[video_id] = value

        return result

    def _extract_durations_from_payload(
        self, video_payload: dict[str, Any]
    ) -> dict[str, str | None]:
        """Extract video durations from a videos.list API response."""
        return self._extract_from_payload(
            video_payload, "contentDetails", "duration", default=None
        )

    def _extract_live_broadcast_content_from_payload(
        self, video_payload: dict[str, Any]
    ) -> dict[str, str]:
        """Extract liveBroadcastContent from a videos.list API response."""
        return self._extract_from_payload(
            video_payload, "snippet", "liveBroadcastContent", default="none"
        )

    def _extract_privacy_status_from_payload(
        self, video_payload: dict[str, Any]
    ) -> dict[str, str]:
        """Extract privacyStatus from a videos.list API response."""
        return self._extract_from_payload(
            video_payload, "status", "privacyStatus", default="public"
        )

    async def _fetch_video_details(
        self, client: httpx.AsyncClient, video_ids: list[str]
    ) -> tuple[dict[str, str | None], dict[str, str], dict[str, str]]:
        """Fetch video durations, live broadcast content, and privacy status in batches.

        Returns:
            Tuple of (durations dict, live_broadcast_content dict, privacy_status dict)

        Docs: https://developers.google.com/youtube/v3/docs/videos/list
        """
        durations: dict[str, str | None] = {}
        live_content: dict[str, str] = {}
        privacy_status: dict[str, str] = {}
        if not video_ids:
            return durations, live_content, privacy_status

        # YouTube API allows up to 50 video IDs per request
        batch_size = 50
        for i in range(0, len(video_ids), batch_size):
            batch = video_ids[i : i + batch_size]
            video_params = {
                "part": "contentDetails,snippet,status",
                "id": ",".join(batch),
                "key": self.api_key,
            }
            try:
                video_payload = await self._request_json(
                    client, "videos", video_params
                )
                batch_durations = self._extract_durations_from_payload(
                    video_payload
                )
                batch_live_content = (
                    self._extract_live_broadcast_content_from_payload(
                        video_payload
                    )
                )
                batch_privacy_status = (
                    self._extract_privacy_status_from_payload(video_payload)
                )
                durations.update(batch_durations)
                live_content.update(batch_live_content)
                privacy_status.update(batch_privacy_status)
            except YoutubeAPIRequestError:
                # If video details fetch fails, continue without details
                logger.warning(
                    "Failed to fetch video details for batch starting at index %s",
                    i,
                )

        return durations, live_content, privacy_status

    def _build_videos_with_details(
        self,
        playlist_items: list[dict[str, Any]],
        durations: dict[str, str | None],
        live_content: dict[str, str],
        privacy_status: dict[str, str],
    ) -> list[YoutubeVideo]:
        """Build YoutubeVideo objects from playlist items with duration, live content, and privacy data."""
        videos: list[YoutubeVideo] = []
        for item in playlist_items:
            if not isinstance(item, dict):
                continue
            snippet = item.get("snippet", {})
            resource = (
                snippet.get("resourceId", {})
                if isinstance(snippet, dict)
                else {}
            )
            video_id = (
                resource.get("videoId") if isinstance(resource, dict) else None
            )
            if not video_id:
                continue

            # Add duration to contentDetails if available
            if isinstance(item.get("contentDetails"), dict):
                if video_id in durations:
                    item["contentDetails"]["duration"] = durations[video_id]
            else:
                item["contentDetails"] = {"duration": durations.get(video_id)}

            # Update liveBroadcastContent from videos.list API if available
            # This ensures we have the most up-to-date live status
            if isinstance(snippet, dict) and video_id in live_content:
                snippet["liveBroadcastContent"] = live_content[video_id]

            # Add privacyStatus to snippet if available
            if isinstance(snippet, dict) and video_id in privacy_status:
                snippet["privacyStatus"] = privacy_status[video_id]

            video = YoutubeVideo.from_playlist_item(item)
            if video is None:
                continue
            videos.append(video)

        return videos

    async def _fetch_videos(
        self,
        client: httpx.AsyncClient,
        playlist_id: str,
        *,
        max_results: int,
        video_type: str | None = None,
    ) -> list[YoutubeVideo]:
        """Fetch uploads from the channel's uploads playlist.

        Ensures that up to max_results successfully converted videos are returned,
        fetching additional pages if some playlist items fail to convert.

        If video_type is specified, filters videos to match that type and continues
        fetching until max_results matching videos are found.

        Args:
            client: HTTP client for API requests.
            playlist_id: Uploads playlist ID.
            max_results: Maximum number of videos to return.
            video_type: Optional filter by video type ("short", "live", or "video").

        Docs: https://developers.google.com/youtube/v3/docs/playlistItems/list
        """
        if max_results <= 0:
            return []

        videos: list[YoutubeVideo] = []
        playlist_items: list[dict[str, Any]] = []
        durations: dict[str, str | None] = {}
        live_content: dict[str, str] = {}
        privacy_status: dict[str, str] = {}
        page_token: str | None = None

        while len(videos) < max_results:
            # Fetch a page of playlist items
            items, page_token = await self._fetch_playlist_items_page(
                client,
                playlist_id,
                max_results=max_results,
                page_token=page_token,
            )

            if not items:
                break

            playlist_items.extend(items)

            # Extract video IDs for new items and fetch their details (duration + live status + privacy)
            new_video_ids = self._extract_video_ids(items)
            if new_video_ids:
                (
                    new_durations,
                    new_live_content,
                    new_privacy_status,
                ) = await self._fetch_video_details(client, new_video_ids)
                durations.update(new_durations)
                live_content.update(new_live_content)
                privacy_status.update(new_privacy_status)

            # Build videos from all accumulated playlist items
            built_videos = self._build_videos_with_details(
                playlist_items, durations, live_content, privacy_status
            )

            # Filter by video type if specified
            if video_type:
                built_videos = [
                    v for v in built_videos if v.video_type == video_type
                ]

            # Sort by published date (newest first) to ensure consistent ordering
            # This is important after filtering, as the order might be disrupted
            built_videos.sort(key=lambda v: v.published_at, reverse=True)

            # Only take up to max_results videos
            videos = built_videos[:max_results]

            # If we've built enough videos or there's no next page, we're done
            if len(videos) >= max_results or not page_token:
                break

        return videos

    @cachedmethod(
        lambda self: self._response_cache,
        key=lambda self, _client, endpoint, params: self._build_cache_key(
            endpoint, params
        ),
    )
    async def _request_json(
        self, client: httpx.AsyncClient, endpoint: str, params: dict[str, Any]
    ) -> dict[str, Any]:
        """Perform a GET request against the YouTube API and decode the JSON body."""
        loggable_params = {k: v for k, v in params.items() if k != "key"}
        logger.info("Fetching YouTube API endpoint %s with params %s", endpoint, loggable_params)
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

    def _build_cache_key(
        self, endpoint: str, params: dict[str, Any]
    ) -> tuple[str, tuple[tuple[str, Any], ...]]:
        normalized_params = tuple(
            sorted((key, self._normalize_param_value(value)) for key, value in params.items())
        )
        return (endpoint, normalized_params)

    def _normalize_param_value(self, value: Any) -> Any:
        if isinstance(value, (list, tuple)):
            return tuple(value)
        return value

    def sync_latest_metrics(self) -> None:
        """Log a placeholder sync until real metrics synchronization is wired in."""
        logger.info("Pretending to sync latest YouTube metrics.")

    async def fetch_authenticated_channel_videos(
        self,
        user_service: "UserService",
        oauth_service: "YoutubeOAuthService",
        channel_id: str | None = None,
        *,
        max_results: int = 50,
        video_type: str | None = None,
    ) -> YoutubeFeed:
        """Run the authenticated channel fetch on a worker thread."""

        return await anyio.to_thread.run_sync(
            self._fetch_authenticated_channel_videos_sync,
            user_service,
            oauth_service,
            channel_id,
            max_results,
            video_type,
        )

    def _fetch_authenticated_channel_videos_sync(
        self,
        user_service: "UserService",
        oauth_service: "YoutubeOAuthService",
        channel_id: str | None,
        max_results: int,
        video_type: str | None,
    ) -> YoutubeFeed:
        """Return recent uploads for the authenticated user's channel.

        If channel_id is provided, fetches videos for that channel.
        Otherwise, fetches videos for the authenticated user's own channel.

        Args:
            user_service: Service for accessing user data.
            oauth_service: Service for OAuth credential management.
            channel_id: Optional channel ID. If None, uses authenticated user's channel.
            max_results: Maximum number of videos to return.
            video_type: Optional filter by video type ("short", "live", or "video").

        Returns:
            YoutubeFeed with channel metadata and videos.

        Raises:
            YoutubeConfigurationError: If credentials are missing or invalid.
            YoutubeChannelNotFound: If the channel cannot be found.
        """
        if max_results <= 0:
            return YoutubeFeed(
                channel_id="",
                channel_title="",
                channel_description=None,
                channel_url="",
                channel_thumbnail_url=None,
                videos=[],
            )

        client = self.build_authenticated_client(user_service, oauth_service)

        # Fetch channel info
        if channel_id:
            channel_response = (
                client.channels()
                .list(
                    part="snippet,contentDetails", id=channel_id, maxResults=1
                )
                .execute()
            )
        else:
            channel_response = (
                client.channels()
                .list(part="snippet,contentDetails", mine=True, maxResults=1)
                .execute()
            )

        channel_items = channel_response.get("items", [])
        if not isinstance(channel_items, list) or not channel_items:
            raise YoutubeChannelNotFound("Channel not found")

        channel_data = channel_items[0]
        channel = YoutubeChannel.from_api_item(channel_data)
        if channel is None:
            raise YoutubeChannelNotFound("Channel data is invalid")

        # Fetch playlist items
        videos: list[YoutubeVideo] = []
        playlist_items: list[dict[str, Any]] = []
        durations: dict[str, str | None] = {}
        live_content: dict[str, str] = {}
        privacy_status: dict[str, str] = {}
        page_token: str | None = None

        while len(videos) < max_results:
            # Fetch a page of playlist items
            playlist_params: dict[str, Any] = {
                "part": "snippet,contentDetails",
                "playlistId": channel.uploads_playlist_id,
                "maxResults": min(MAX_RESULTS_CAP, max_results),
            }
            if page_token:
                playlist_params["pageToken"] = page_token

            playlist_response = (
                client.playlistItems().list(**playlist_params).execute()
            )
            items = playlist_response.get("items", [])
            if not isinstance(items, list):
                items = []

            if not items:
                break

            playlist_items.extend(items)
            page_token = playlist_response.get("nextPageToken")

            # Extract video IDs and fetch details (duration + live status + privacy)
            video_ids = self._extract_video_ids(items)
            if video_ids:
                # Fetch video details including durations, live status, and privacy
                video_params = {
                    "part": "contentDetails,snippet,status",
                    "id": ",".join(video_ids[:50]),  # API limit is 50
                }
                video_response = client.videos().list(**video_params).execute()
                video_items = video_response.get("items", [])
                if isinstance(video_items, list):
                    batch_durations = self._extract_durations_from_payload(
                        {"items": video_items}
                    )
                    batch_live_content = (
                        self._extract_live_broadcast_content_from_payload(
                            {"items": video_items}
                        )
                    )
                    batch_privacy_status = (
                        self._extract_privacy_status_from_payload(
                            {"items": video_items}
                        )
                    )
                    durations.update(batch_durations)
                    live_content.update(batch_live_content)
                    privacy_status.update(batch_privacy_status)

            # Build videos from accumulated playlist items
            built_videos = self._build_videos_with_details(
                playlist_items, durations, live_content, privacy_status
            )

            # Filter by video type if specified
            if video_type:
                built_videos = [
                    v for v in built_videos if v.video_type == video_type
                ]

            # Sort by published date (newest first) to ensure consistent ordering
            # This is important after filtering, as the order might be disrupted
            built_videos.sort(key=lambda v: v.published_at, reverse=True)

            videos = built_videos[:max_results]

            if len(videos) >= max_results or not page_token:
                break

        return YoutubeFeed(
            channel_id=channel.id,
            channel_title=channel.title,
            channel_description=channel.description,
            channel_url=channel.url,
            channel_thumbnail_url=channel.thumbnail_url,
            videos=videos,
        )

    def build_authenticated_client(
        self,
        user_service: "UserService",
        oauth_service: "YoutubeOAuthService",
    ) -> "YoutubeApiClient":
        """Return an authenticated Google API client based on stored credentials."""

        record = user_service.get_active_user()
        if record is None or not record.credentials_json:
            raise YoutubeConfigurationError(
                "No stored OAuth credentials available for the active user"
            )

        credentials = oauth_service.deserialize_credentials(
            record.credentials_json
        )
        if credentials.expired:
            if not credentials.refresh_token:
                raise YoutubeConfigurationError(
                    "Stored credentials are expired and cannot be refreshed"
                )
            try:
                oauth_service.refresh_credentials(credentials)
            except YoutubeConfigurationError as exc:
                # Clear invalid credentials so the UI can prompt for re-linking.
                user_service.upsert_credentials(
                    None,
                    None,
                    error_message=str(exc),
                )
                raise
            user_service.upsert_credentials(
                oauth_service.serialize_credentials(credentials),
                datetime.now(tz=UTC),
            )

        client = build(
            "youtube",
            "v3",
            credentials=credentials,
            cache_discovery=False,
        )
        return cast("YoutubeApiClient", client)

    async def fetch_channel_feed(
        self,
        channel: str,
        *,
        video_type: str | None = None,
        user_service: "UserService | None" = None,
        oauth_service: "YoutubeOAuthService | None" = None,
        max_results: int = 50,
    ) -> YoutubeFeed:
        """Return recent uploads for the provided channel identifier.

        Automatically chooses between authenticated and API key-based requests
        based on available credentials. Falls back to API key method if
        authentication fails or is unavailable.

        Args:
            channel: Channel identifier (handle, ID, or URL).
            video_type: Optional filter by video type ("short", "live", or "video").
            user_service: Service for accessing user data (required for authenticated requests).
            oauth_service: Service for OAuth credential management (required for authenticated requests).
            max_results: Maximum number of videos to return.

        Returns:
            YoutubeFeed with channel metadata and videos.
        """
        # Check if we should attempt authenticated request
        is_authenticated = False
        if user_service is not None and oauth_service is not None:
            record = user_service.get_active_user()
            is_authenticated = (
                record is not None and record.credentials_json is not None
            )

        if (
            is_authenticated
            and user_service is not None
            and oauth_service is not None
        ):
            # Try authenticated method first
            try:
                return await self.fetch_authenticated_channel_videos(
                    user_service,
                    oauth_service,
                    channel_id=channel,
                    max_results=max_results,
                    video_type=video_type,
                )
            except YoutubeConfigurationError:
                # Fall back to API key method if auth fails
                pass

        # Use API key method (either no auth available or auth failed)
        return await self.fetch_channel_videos(
            channel, max_results=max_results, video_type=video_type
        )

    async def fetch_video_detail(
        self,
        video_id: str,
        *,
        user_service: "UserService | None" = None,
        oauth_service: "YoutubeOAuthService | None" = None,
    ) -> YoutubeVideo:
        """Return details for a single video by ID.

        Automatically chooses between authenticated and API key-based requests
        based on available credentials. Falls back to API key method if
        authentication fails or is unavailable.

        Args:
            video_id: YouTube video ID.
            user_service: Service for accessing user data (required for authenticated requests).
            oauth_service: Service for OAuth credential management (required for authenticated requests).

        Returns:
            YoutubeVideo with video details.

        Raises:
            YoutubeAPIRequestError: If the video cannot be found or API request fails.
        """
        if not video_id:
            raise YoutubeAPIRequestError("Video ID is required")

        # Check if we should attempt authenticated request
        is_authenticated = False
        if user_service is not None and oauth_service is not None:
            record = user_service.get_active_user()
            is_authenticated = (
                record is not None and record.credentials_json is not None
            )

        if (
            is_authenticated
            and user_service is not None
            and oauth_service is not None
        ):
            # Try authenticated method first
            try:
                return self._fetch_video_detail_authenticated(
                    video_id, user_service, oauth_service
                )
            except YoutubeConfigurationError:
                # Fall back to API key method if auth fails
                pass

        # Use API key method (either no auth available or auth failed)
        return await self._fetch_video_detail_with_api_key(video_id)

    async def _fetch_video_detail_with_api_key(
        self, video_id: str
    ) -> YoutubeVideo:
        """Fetch video details using API key authentication."""
        if not self.api_key:
            raise YoutubeConfigurationError("YouTube API key not configured")

        async with self.client_session() as client:
            params = {
                "part": "contentDetails,snippet,status,statistics",
                "id": video_id,
                "key": self.api_key,
            }
            payload = await self._request_json(client, "videos", params)
            items = payload.get("items", [])
            if not isinstance(items, list) or not items:
                raise YoutubeAPIRequestError(f"Video {video_id} not found")

            # Find the video item matching the requested video_id
            # (in case fixture returns multiple videos)
            video_item = None
            for item in items:
                if isinstance(item, dict) and item.get("id") == video_id:
                    video_item = item
                    break

            if video_item is None:
                raise YoutubeAPIRequestError(f"Video {video_id} not found")

            snippet = video_item.get("snippet", {})
            content_details = video_item.get("contentDetails", {})
            status = video_item.get("status", {})
            statistics_data = video_item.get("statistics", {})

            # Create a playlist item-like dict
            playlist_item_like = {
                "snippet": {
                    **snippet,
                    "resourceId": {"videoId": video_id},
                    "liveBroadcastContent": snippet.get(
                        "liveBroadcastContent", "none"
                    ),
                    "privacyStatus": status.get("privacyStatus", "public")
                    if isinstance(status, dict)
                    else "public",
                },
                "contentDetails": content_details,
            }

            video = YoutubeVideo.from_playlist_item(playlist_item_like)
            if video is None:
                raise YoutubeAPIRequestError(
                    f"Failed to parse video {video_id}"
                )
            # Add statistics to the video
            video.statistics = YoutubeVideoStatistics.from_api_response(statistics_data)
            return video

    def _fetch_video_detail_authenticated(
        self,
        video_id: str,
        user_service: "UserService",
        oauth_service: "YoutubeOAuthService",
    ) -> YoutubeVideo:
        """Fetch video details using OAuth authentication."""
        client = self.build_authenticated_client(user_service, oauth_service)

        video_response = (
            client.videos()
            .list(
                part="contentDetails,snippet,status,statistics", id=video_id, maxResults=1
            )
            .execute()
        )

        items = video_response.get("items", [])
        if not isinstance(items, list) or not items:
            raise YoutubeAPIRequestError(f"Video {video_id} not found")

        # Find the video item matching the requested video_id
        # (in case fixture returns multiple videos)
        video_item = None
        for item in items:
            if isinstance(item, dict) and item.get("id") == video_id:
                video_item = item
                break

        if video_item is None:
            raise YoutubeAPIRequestError(f"Video {video_id} not found")

        snippet = video_item.get("snippet", {})
        content_details = video_item.get("contentDetails", {})
        status = video_item.get("status", {})
        statistics_data = video_item.get("statistics", {})

        # Create a playlist item-like dict
        playlist_item_like = {
            "snippet": {
                **snippet,
                "resourceId": {"videoId": video_id},
                "liveBroadcastContent": snippet.get(
                    "liveBroadcastContent", "none"
                ),
                "privacyStatus": status.get("privacyStatus", "public")
                if isinstance(status, dict)
                else "public",
            },
            "contentDetails": content_details,
        }

        video = YoutubeVideo.from_playlist_item(playlist_item_like)
        if video is None:
            raise YoutubeAPIRequestError(f"Failed to parse video {video_id}")
        # Add statistics to the video
        video.statistics = YoutubeVideoStatistics.from_api_response(statistics_data)
        return video

    async def fetch_channel_statistics(
        self,
        channel_id: str,
        *,
        user_service: "UserService | None" = None,
        oauth_service: "YoutubeOAuthService | None" = None,
    ) -> YoutubeChannelStatistics:
        """Return statistics for a channel by ID.

        Automatically chooses between authenticated and API key-based requests
        based on available credentials.

        Args:
            channel_id: YouTube channel ID.
            user_service: Service for accessing user data.
            oauth_service: Service for OAuth credential management.

        Returns:
            YoutubeChannelStatistics with view count, subscriber count, and video count.
        """
        # Check if we should attempt authenticated request
        is_authenticated = False
        if user_service is not None and oauth_service is not None:
            record = user_service.get_active_user()
            is_authenticated = (
                record is not None and record.credentials_json is not None
            )

        if (
            is_authenticated
            and user_service is not None
            and oauth_service is not None
        ):
            # Try authenticated method first
            try:
                return await anyio.to_thread.run_sync(
                    self._fetch_channel_statistics_authenticated,
                    channel_id,
                    user_service,
                    oauth_service,
                )
            except YoutubeConfigurationError:
                # Fall back to API key method if auth fails
                pass

        # Use API key method
        return await self._fetch_channel_statistics_with_api_key(channel_id)

    async def _fetch_channel_statistics_with_api_key(
        self, channel_id: str
    ) -> YoutubeChannelStatistics:
        """Fetch channel statistics using API key authentication."""
        if not self.api_key:
            raise YoutubeConfigurationError("YouTube API key not configured")

        async with self.client_session() as client:
            params = {
                "part": "statistics",
                "id": channel_id,
                "key": self.api_key,
            }
            payload = await self._request_json(client, "channels", params)
            items = payload.get("items", [])
            if not isinstance(items, list) or not items:
                raise YoutubeAPIRequestError(f"Channel {channel_id} not found")

            channel_item = items[0]
            statistics_data = channel_item.get("statistics", {})
            return YoutubeChannelStatistics.from_api_response(statistics_data)

    def _fetch_channel_statistics_authenticated(
        self,
        channel_id: str,
        user_service: "UserService",
        oauth_service: "YoutubeOAuthService",
    ) -> YoutubeChannelStatistics:
        """Fetch channel statistics using OAuth authentication."""
        client = self.build_authenticated_client(user_service, oauth_service)

        channel_response = (
            client.channels()
            .list(part="statistics", id=channel_id, maxResults=1)
            .execute()
        )

        items = channel_response.get("items", [])
        if not isinstance(items, list) or not items:
            raise YoutubeAPIRequestError(f"Channel {channel_id} not found")

        channel_item = items[0]
        statistics_data = channel_item.get("statistics", {})
        return YoutubeChannelStatistics.from_api_response(statistics_data)


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
