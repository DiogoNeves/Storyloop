"""YouTube Data API integration helpers."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Literal

from collections.abc import AsyncIterator

import httpx

from app.services.youtube_identifier import build_lookup_candidates
from app.utils.datetime import parse_datetime, parse_duration_seconds

logger = logging.getLogger(__name__)

YOUTUBE_API_BASE_URL = "https://www.googleapis.com/youtube/v3"
YOUTUBE_ANALYTICS_API_BASE_URL = "https://youtubeanalytics.googleapis.com/v2"
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
    video_type: Literal["short", "live", "video"]

    def to_dict(self) -> dict[str, Any]:
        """Serialize the video into a JSON-friendly dictionary."""
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "publishedAt": self.published_at.isoformat(),
            "url": self.url,
            "thumbnailUrl": self.thumbnail_url,
            "videoType": self.video_type,
        }

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
        live_broadcast_content = snippet.get("liveBroadcastContent", "none")
        is_live = live_broadcast_content in ("live", "upcoming")

        # Extract duration from contentDetails
        # Note: playlistItems.contentDetails doesn't include duration, but we check
        # in case it's available in future API versions
        content_details = item.get("contentDetails", {})
        duration_str = (
            content_details.get("duration")
            if isinstance(content_details, dict)
            else None
        )
        duration_seconds = parse_duration_seconds(duration_str)
        is_short = duration_seconds is not None and duration_seconds <= 60

        # Determine video type
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


@dataclass(slots=True)
class YoutubeVideoMetrics:
    """Metrics for a YouTube video."""

    video_id: str
    views: int
    impressions: int
    ctr: float  # Calculated: views/impressions * 100
    average_view_duration_seconds: float
    video_length_seconds: int  # From video contentDetails
    score: float  # Calculated: ctr * (avg_view_duration / video_length)
    published_at: datetime

    def to_dict(self) -> dict[str, Any]:
        """Serialize metrics for API responses."""
        return {
            "videoId": self.video_id,
            "views": self.views,
            "impressions": self.impressions,
            "ctr": self.ctr,
            "averageViewDurationSeconds": self.average_view_duration_seconds,
            "videoLengthSeconds": self.video_length_seconds,
            "score": self.score,
            "publishedAt": self.published_at.isoformat(),
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

    def _extract_durations_from_payload(
        self, video_payload: dict[str, Any]
    ) -> dict[str, str | None]:
        """Extract video durations from a videos.list API response."""
        durations: dict[str, str | None] = {}
        video_items = video_payload.get("items", [])
        if not isinstance(video_items, list):
            return durations

        for video_item in video_items:
            if not isinstance(video_item, dict):
                continue
            video_id = video_item.get("id")
            content_details = video_item.get("contentDetails", {})
            duration = (
                content_details.get("duration")
                if isinstance(content_details, dict)
                else None
            )
            if video_id:
                durations[video_id] = duration

        return durations

    async def _fetch_video_durations(
        self, client: httpx.AsyncClient, video_ids: list[str]
    ) -> dict[str, str | None]:
        """Fetch video durations in batches.

        Docs: https://developers.google.com/youtube/v3/docs/videos/list
        """
        durations: dict[str, str | None] = {}
        if not video_ids:
            return durations

        # YouTube API allows up to 50 video IDs per request
        batch_size = 50
        for i in range(0, len(video_ids), batch_size):
            batch = video_ids[i : i + batch_size]
            video_params = {
                "part": "contentDetails",
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
                durations.update(batch_durations)
            except YoutubeAPIRequestError:
                # If video details fetch fails, continue without durations
                logger.warning(
                    "Failed to fetch video details for batch starting at index %s",
                    i,
                )

        return durations

    def _build_videos_with_durations(
        self,
        playlist_items: list[dict[str, Any]],
        durations: dict[str, str | None],
    ) -> list[YoutubeVideo]:
        """Build YoutubeVideo objects from playlist items with duration data."""
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
    ) -> list[YoutubeVideo]:
        """Fetch uploads from the channel's uploads playlist.

        Ensures that up to max_results successfully converted videos are returned,
        fetching additional pages if some playlist items fail to convert.

        Docs: https://developers.google.com/youtube/v3/docs/playlistItems/list
        """
        if max_results <= 0:
            return []

        videos: list[YoutubeVideo] = []
        playlist_items: list[dict[str, Any]] = []
        durations: dict[str, str | None] = {}
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

            # Extract video IDs for new items and fetch their durations
            new_video_ids = self._extract_video_ids(items)
            if new_video_ids:
                new_durations = await self._fetch_video_durations(
                    client, new_video_ids
                )
                durations.update(new_durations)

            # Build videos from all accumulated playlist items
            built_videos = self._build_videos_with_durations(
                playlist_items, durations
            )
            # Only take up to max_results videos
            videos = built_videos[:max_results]

            # If we've built enough videos or there's no next page, we're done
            if len(videos) >= max_results or not page_token:
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

    async def get_video_length_seconds(
        self, client: httpx.AsyncClient, video_id: str
    ) -> int | None:
        """Get video length in seconds from video contentDetails.

        Args:
            client: HTTP client for API requests
            video_id: YouTube video ID

        Returns:
            Video length in seconds, or None if not available
        """
        params = {
            "part": "contentDetails",
            "id": video_id,
            "key": self.api_key,
        }
        try:
            payload = await self._request_json(client, "videos", params)
            items = payload.get("items", [])
            if not isinstance(items, list) or not items:
                return None
            content_details = items[0].get("contentDetails", {})
            if not isinstance(content_details, dict):
                return None
            duration_str = content_details.get("duration")
            return parse_duration_seconds(duration_str)
        except YoutubeAPIRequestError:
            logger.warning("Failed to fetch video length for %s", video_id)
            return None

    async def fetch_video_metrics(
        self,
        channel_id: str,
        video_ids: list[str],
        *,
        oauth_token: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> list[YoutubeVideoMetrics]:
        """Fetch YouTube Analytics metrics for the specified videos.

        Args:
            channel_id: YouTube channel ID
            video_ids: List of video IDs to fetch metrics for
            oauth_token: OAuth2 access token for YouTube Analytics API
            start_date: Start date in YYYY-MM-DD format (defaults to 30 days ago)
            end_date: End date in YYYY-MM-DD format (defaults to today)

        Returns:
            List of video metrics

        Raises:
            YoutubeConfigurationError: If OAuth token is missing
            YoutubeAPIRequestError: If API request fails
        """
        if not oauth_token:
            raise YoutubeConfigurationError(
                "OAuth2 token required for YouTube Analytics API"
            )

        if not video_ids:
            return []

        # Set default date range if not provided
        if not end_date:
            end_date = datetime.now().date().isoformat()
        if not start_date:
            start_date = (
                datetime.now().date() - timedelta(days=30)
            ).isoformat()

        # Fetch video lengths and published dates
        video_lengths: dict[str, int] = {}
        video_published_dates: dict[str, datetime] = {}

        async with self.client_session() as client:
            # Fetch video details in batches
            batch_size = 50
            for i in range(0, len(video_ids), batch_size):
                batch = video_ids[i : i + batch_size]
                params = {
                    "part": "contentDetails,snippet",
                    "id": ",".join(batch),
                    "key": self.api_key,
                }
                try:
                    payload = await self._request_json(client, "videos", params)
                    items = payload.get("items", [])
                    if not isinstance(items, list):
                        continue
                    for item in items:
                        if not isinstance(item, dict):
                            continue
                        video_id = item.get("id")
                        if not video_id:
                            continue

                        # Extract duration
                        content_details = item.get("contentDetails", {})
                        duration_str = (
                            content_details.get("duration")
                            if isinstance(content_details, dict)
                            else None
                        )
                        duration_seconds = parse_duration_seconds(duration_str)
                        if duration_seconds is not None:
                            video_lengths[video_id] = duration_seconds

                        # Extract published date
                        snippet = item.get("snippet", {})
                        published_at_raw = (
                            snippet.get("publishedAt")
                            if isinstance(snippet, dict)
                            else None
                        )
                        if published_at_raw:
                            try:
                                published_at = parse_datetime(published_at_raw)
                                video_published_dates[video_id] = published_at
                            except ValueError:
                                logger.warning(
                                    "Failed to parse published date for video %s",
                                    video_id,
                                )
                except YoutubeAPIRequestError:
                    logger.warning(
                        "Failed to fetch video details for batch starting at index %s",
                        i,
                    )

        # Fetch analytics metrics
        metrics: list[YoutubeVideoMetrics] = []

        # YouTube Analytics API requires video IDs as dimension filters
        # We'll query for all videos and filter client-side
        analytics_client = httpx.AsyncClient(
            base_url=YOUTUBE_ANALYTICS_API_BASE_URL,
            timeout=DEFAULT_TIMEOUT,
            transport=self._transport,
        )

        try:
            params = {
                "ids": f"channel=={channel_id}",
                "metrics": "views,impressions,averageViewDuration",
                "dimensions": "video",
                "startDate": start_date,
                "endDate": end_date,
                "maxResults": 200,  # Maximum allowed
            }

            headers = {"Authorization": f"Bearer {oauth_token}"}

            try:
                response = await analytics_client.get(
                    "reports", params=params, headers=headers
                )
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                detail = (
                    exc.response.json().get("error", {}).get("message")
                    if exc.response.headers.get("content-type", "").startswith(
                        "application/json"
                    )
                    else exc.response.text
                )
                message = (
                    "YouTube Analytics API request failed with status %s: %s"
                    % (
                        exc.response.status_code,
                        detail,
                    )
                )
                raise YoutubeAPIRequestError(message) from exc
            except httpx.RequestError as exc:
                message = (
                    f"Error communicating with YouTube Analytics API: {exc}"
                )
                raise YoutubeAPIRequestError(message) from exc

            try:
                data = response.json()
            except ValueError as exc:
                message = "YouTube Analytics API returned invalid JSON"
                raise YoutubeAPIRequestError(message) from exc

            if not isinstance(data, dict):
                message = "YouTube Analytics API returned unexpected payload"
                raise YoutubeAPIRequestError(message)

            # Parse analytics response
            rows = data.get("rows", [])
            if not isinstance(rows, list):
                return []

            # Create a set of requested video IDs for filtering
            requested_video_ids = set(video_ids)

            # Create a map of video_id -> metrics
            for row in rows:
                if not isinstance(row, list) or len(row) < 4:
                    continue
                video_id = str(row[0])

                # Filter to only requested videos
                if video_id not in requested_video_ids:
                    continue

                views = int(row[1]) if isinstance(row[1], (int, float)) else 0
                impressions = (
                    int(row[2]) if isinstance(row[2], (int, float)) else 0
                )
                avg_view_duration_str = str(row[3])

                # Parse averageViewDuration (ISO 8601 duration format)
                avg_view_duration_seconds = parse_duration_seconds(
                    avg_view_duration_str
                )
                if avg_view_duration_seconds is None:
                    avg_view_duration_seconds = 0.0

                # Get video length
                video_length = video_lengths.get(video_id)
                if video_length is None or video_length == 0:
                    # Skip videos without length data
                    logger.debug(
                        "Skipping video %s: missing or zero length", video_id
                    )
                    continue

                # Calculate CTR
                ctr = (views / impressions * 100) if impressions > 0 else 0.0

                # Calculate score: CTR * (avg_view_duration / video_length)
                score = ctr * (avg_view_duration_seconds / video_length)

                # Get published date
                published_at = video_published_dates.get(
                    video_id, datetime.now()
                )

                metrics.append(
                    YoutubeVideoMetrics(
                        video_id=video_id,
                        views=views,
                        impressions=impressions,
                        ctr=ctr,
                        average_view_duration_seconds=float(
                            avg_view_duration_seconds
                        ),
                        video_length_seconds=video_length,
                        score=score,
                        published_at=published_at,
                    )
                )
        finally:
            await analytics_client.aclose()

        return metrics

    async def fetch_channel_videos_with_metrics(
        self,
        identifier: str,
        *,
        max_results: int = 50,
        oauth_token: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> tuple[YoutubeFeed, list[YoutubeVideoMetrics]]:
        """Fetch channel videos and metrics in parallel.

        Args:
            identifier: Channel identifier (handle, link, or ID)
            max_results: Maximum number of videos to return
            oauth_token: OAuth2 access token for YouTube Analytics API (optional)
            start_date: Start date in YYYY-MM-DD format (defaults to 30 days ago)
            end_date: End date in YYYY-MM-DD format (defaults to today)

        Returns:
            Tuple of (feed, metrics). Metrics will be empty list if OAuth token
            is not provided or if metrics fetch fails.
        """
        # Fetch videos first (required)
        feed = await self.fetch_channel_videos(
            identifier, max_results=max_results
        )

        # Fetch metrics in parallel if OAuth token is provided
        metrics: list[YoutubeVideoMetrics] = []
        if oauth_token and feed.videos:
            video_ids = [video.id for video in feed.videos]
            try:
                metrics = await self.fetch_video_metrics(
                    channel_id=feed.channel_id,
                    video_ids=video_ids,
                    oauth_token=oauth_token,
                    start_date=start_date,
                    end_date=end_date,
                )
            except YoutubeError as exc:
                # Log but don't fail - metrics are optional
                logger.warning(
                    "Failed to fetch metrics for channel %s: %s",
                    feed.channel_id,
                    exc,
                )
                metrics = []

        return feed, metrics

    def sync_latest_metrics(self) -> None:
        """Log a placeholder sync until real metrics synchronization is wired in."""
        logger.info("Pretending to sync latest YouTube metrics.")


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
