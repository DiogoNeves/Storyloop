"""Standalone Storyloop scorecard calculator for YouTube channels.

This script fetches the latest uploads for a given YouTube channel,
collects basic engagement metrics, and calculates the same growth
scorecard we plan to surface in the Storyloop dashboard.

It is intentionally self-contained so we can validate the math and data
pipelines before wiring anything into the API or frontend.

Usage
-----

1. Acquire a YouTube Data API v3 key and export it as ``YOUTUBE_API_KEY``
   (or pass ``--api-key`` when running the script).
2. From the repository root run::

       python scripts/youtube_scorecard.py <channel-handle-or-url>

   For example::

       python scripts/youtube_scorecard.py @GoogleDevelopers

3. To inspect the raw payload use ``--json`` to emit structured output
   that the frontend can later consume.

The script only depends on ``httpx`` (already used in the backend) and
may be executed independently of the FastAPI app.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import math
import os
import re
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from statistics import fmean
from typing import Iterable, Literal, Sequence
from urllib.parse import parse_qs, urlparse

import httpx


YOUTUBE_API_BASE_URL = "https://www.googleapis.com/youtube/v3"
DEFAULT_TIMEOUT = 10.0
CHANNEL_ID_PATTERN = re.compile(r"^UC[0-9A-Za-z_-]{22}$")


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
    """Structured representation of a YouTube upload."""

    id: str
    title: str
    published_at: datetime
    url: str
    thumbnail_url: str | None


@dataclass(slots=True)
class YoutubeVideoStatistics:
    """Subset of video statistics required for scorecard calculations."""

    view_count: int
    like_count: int | None
    comment_count: int | None


@dataclass(slots=True)
class YoutubeFeed:
    """Channel metadata plus associated video uploads."""

    channel_id: str
    channel_title: str
    channel_description: str | None
    channel_url: str
    channel_thumbnail_url: str | None
    videos: list[YoutubeVideo]


@dataclass(slots=True)
class YoutubeChannel:
    """Internal representation of a resolved channel."""

    id: str
    title: str
    description: str | None
    url: str
    uploads_playlist_id: str
    thumbnail_url: str | None


class YoutubeService:
    """Minimal async client for interacting with the YouTube Data API."""

    def __init__(
        self,
        *,
        api_key: str | None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.api_key = api_key
        self._transport = transport

    def _create_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=YOUTUBE_API_BASE_URL,
            timeout=DEFAULT_TIMEOUT,
            transport=self._transport,
        )

    async def fetch_channel_videos(
        self, identifier: str, *, max_results: int = 50
    ) -> YoutubeFeed:
        if not self.api_key:
            raise YoutubeConfigurationError("YouTube API key not configured")

        trimmed_identifier = identifier.strip()
        if not trimmed_identifier:
            raise YoutubeChannelNotFound("Provide a channel handle, link, or ID")

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

    async def fetch_video_statistics(
        self, video_ids: Iterable[str]
    ) -> dict[str, YoutubeVideoStatistics]:
        if not self.api_key:
            raise YoutubeConfigurationError("YouTube API key not configured")

        unique_ids: list[str] = []
        seen: set[str] = set()
        for video_id in video_ids:
            if not video_id or video_id in seen:
                continue
            seen.add(video_id)
            unique_ids.append(video_id)

        if not unique_ids:
            return {}

        statistics: dict[str, YoutubeVideoStatistics] = {}
        batch_size = 50

        async with self._create_client() as client:
            for start in range(0, len(unique_ids), batch_size):
                batch = unique_ids[start : start + batch_size]
                params = {
                    "part": "statistics",
                    "id": ",".join(batch),
                    "key": self.api_key,
                }
                payload = await self._request_json(client, "videos", params)
                items = payload.get("items", [])
                if not isinstance(items, list):
                    continue
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    video_id, stats = self._statistics_from_item(item)
                    if video_id and stats is not None:
                        statistics[video_id] = stats

        return statistics

    async def _resolve_channel(
        self, client: httpx.AsyncClient, identifier: str
    ) -> YoutubeChannel:
        for candidate in build_lookup_candidates(identifier):
            if candidate.endpoint == "channels":
                channel = await self._try_resolve_channel(client, candidate.params)
            else:
                channel = await self._resolve_channel_from_video(
                    client, candidate.params["id"]
                )
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
            return None
        return await self._try_resolve_channel(client, {"id": channel_id})

    async def _resolve_channel_via_search(
        self, client: httpx.AsyncClient, identifier: str
    ) -> YoutubeChannel | None:
        params = {
            "part": "snippet",
            "type": "channel",
            "maxResults": 1,
            "q": identifier,
            "key": self.api_key,
        }
        payload = await self._request_json(client, "search", params)
        items = payload.get("items", [])
        if not isinstance(items, list) or not items:
            return None
        first_item = items[0]
        if not isinstance(first_item, dict):
            return None
        channel_id = (
            first_item.get("id", {}).get("channelId")
            if isinstance(first_item.get("id"), dict)
            else None
        )
        if not channel_id:
            return None
        return await self._try_resolve_channel(client, {"id": channel_id})

    async def _try_resolve_channel(
        self, client: httpx.AsyncClient, params: dict[str, str]
    ) -> YoutubeChannel | None:
        request_params = {
            "part": "snippet,contentDetails",
            "maxResults": 1,
            "key": self.api_key,
            **params,
        }
        payload = await self._request_json(client, "channels", request_params)
        items = payload.get("items", [])
        if not isinstance(items, list):
            return None
        for item in items:
            if not isinstance(item, dict):
                continue
            channel = self._channel_from_item(item)
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
        if max_results <= 0:
            return []

        videos: list[YoutubeVideo] = []
        page_token: str | None = None

        while len(videos) < max_results:
            params: dict[str, str] = {
                "part": "snippet",
                "playlistId": playlist_id,
                "key": self.api_key,
                "maxResults": str(min(50, max_results)),
            }
            if page_token is not None:
                params["pageToken"] = page_token

            payload = await self._request_json(client, "playlistItems", params)
            items = payload.get("items", [])
            if not isinstance(items, list) or not items:
                break

            for item in items:
                video = self._video_from_playlist_item(item)
                if video is not None:
                    videos.append(video)
                if len(videos) >= max_results:
                    break

            page_token = payload.get("nextPageToken")
            if not page_token:
                break

        return videos

    async def _request_json(
        self, client: httpx.AsyncClient, endpoint: str, params: dict[str, str]
    ) -> dict[str, object]:
        try:
            response = await client.get(endpoint, params=params)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
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
        except httpx.RequestError as exc:
            message = f"Error communicating with YouTube API: {exc}"
            raise YoutubeAPIRequestError(message) from exc

        try:
            payload = response.json()
        except ValueError as exc:
            raise YoutubeAPIRequestError(
                f"YouTube API returned invalid JSON for {endpoint}"
            ) from exc
        if not isinstance(payload, dict):
            raise YoutubeAPIRequestError(
                f"YouTube API returned unexpected payload for {endpoint}"
            )
        return payload

    def _channel_from_item(self, item: dict[str, object]) -> YoutubeChannel | None:
        channel_id = item.get("id")
        if not isinstance(channel_id, str) or not channel_id:
            return None
        content_details = item.get("contentDetails")
        uploads_playlist_id = (
            content_details.get("relatedPlaylists", {}).get("uploads")
            if isinstance(content_details, dict)
            else None
        )
        if not isinstance(uploads_playlist_id, str) or not uploads_playlist_id:
            return None
        snippet = item.get("snippet")
        snippet_dict: dict[str, object] = snippet if isinstance(snippet, dict) else {}
        thumbnail_url = select_thumbnail_url(
            snippet_dict.get("thumbnails"), ("high", "medium", "default")
        )
        description = snippet_dict.get("description")
        return YoutubeChannel(
            id=channel_id,
            title=str(snippet_dict.get("title", "Unnamed channel")),
            description=str(description) if isinstance(description, str) else None,
            url=f"https://www.youtube.com/channel/{channel_id}",
            uploads_playlist_id=uploads_playlist_id,
            thumbnail_url=thumbnail_url,
        )

    def _video_from_playlist_item(
        self, item: object
    ) -> YoutubeVideo | None:
        if not isinstance(item, dict):
            return None
        snippet = item.get("snippet")
        if not isinstance(snippet, dict):
            return None
        resource = snippet.get("resourceId")
        resource_dict = resource if isinstance(resource, dict) else {}
        video_id = resource_dict.get("videoId")
        if not isinstance(video_id, str) or not video_id:
            return None
        published_at_raw = snippet.get("publishedAt")
        try:
            published_at = parse_rfc3339_datetime(published_at_raw)
        except ValueError:
            return None
        title = snippet.get("title", "Untitled video")
        thumbnails = snippet.get("thumbnails")
        thumbnail_url = select_thumbnail_url(
            thumbnails, ("high", "medium", "standard", "default")
        )
        return YoutubeVideo(
            id=video_id,
            title=str(title),
            published_at=published_at,
            url=f"https://www.youtube.com/watch?v={video_id}",
            thumbnail_url=thumbnail_url,
        )

    def _statistics_from_item(
        self, item: dict[str, object]
    ) -> tuple[str | None, YoutubeVideoStatistics | None]:
        video_id = item.get("id")
        if not isinstance(video_id, str) or not video_id:
            return None, None
        statistics = item.get("statistics")
        if not isinstance(statistics, dict):
            return video_id, None
        view_count = coerce_int(statistics.get("viewCount"))
        if view_count is None:
            return video_id, None
        like_count = coerce_int(statistics.get("likeCount"))
        comment_count = coerce_int(statistics.get("commentCount"))
        return video_id, YoutubeVideoStatistics(
            view_count=view_count,
            like_count=like_count,
            comment_count=comment_count,
        )


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


def build_lookup_candidates(identifier: str) -> list[LookupCandidate]:
    """Construct ordered lookup attempts for a channel identifier."""

    cleaned = identifier.strip()
    if not cleaned:
        return []

    url_hints = collect_url_hints(cleaned) if "://" in cleaned else None

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
            handles.append(clean_handle(cleaned))
        else:
            handles.append(clean_handle(cleaned))
            usernames.append(cleaned)

    candidates: list[LookupCandidate] = []
    for channel_id in unique_strings(channel_ids):
        candidates.append(
            LookupCandidate(endpoint="channels", params={"id": channel_id})
        )
    for handle in unique_strings(handles):
        candidates.append(
            LookupCandidate(endpoint="channels", params={"forHandle": handle})
        )
    for username in unique_strings(usernames):
        candidates.append(
            LookupCandidate(endpoint="channels", params={"forUsername": username})
        )

    for video_id in unique_strings(video_ids):
        candidates.append(
            LookupCandidate(endpoint="video", params={"id": video_id})
        )

    return candidates


def collect_url_hints(identifier: str) -> UrlIdentifierHints | None:
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
            hints.handles.append(clean_handle(trimmed))

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


def clean_handle(value: str) -> str:
    """Strip the leading @ from handle-like identifiers."""

    return value[1:] if value.startswith("@") else value


def unique_strings(values: Iterable[str]) -> list[str]:
    """Deduplicate strings while preserving order."""

    seen: set[str] = set()
    unique: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        unique.append(value)
    return unique


def select_thumbnail_url(
    thumbnails: object, preferred_order: tuple[str, ...]
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


def coerce_int(value: object) -> int | None:
    """Convert YouTube API numeric fields into integers when possible."""

    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return None
    return None


def parse_rfc3339_datetime(raw: object) -> datetime:
    """Parse a timestamp from the YouTube API."""

    if not isinstance(raw, str) or not raw:
        raise ValueError("Timestamp is missing or not a string")
    # YouTube returns ISO 8601 / RFC 3339 timestamps, often with a trailing Z.
    normalised = raw.replace("Z", "+00:00")
    return datetime.fromisoformat(normalised)

@dataclass(slots=True)
class VideoBreakdown:
    """Computed metrics for a single upload."""

    video_id: str
    title: str
    url: str
    published_at: datetime
    view_count: int
    view_velocity: float
    engagement_rate: float


@dataclass(slots=True)
class ScoreComponents:
    """Individual subscores that roll up into the growth score."""

    view_velocity: float
    engagement: float
    consistency: float


@dataclass(slots=True)
class ScorecardTotals:
    """Aggregate metrics displayed alongside the score."""

    analyzed_uploads: int
    total_views: int
    average_views: float
    average_view_velocity: float
    average_engagement_rate: float
    uploads_per_week: float
    average_upload_interval_days: float | None


@dataclass(slots=True)
class ScorecardResult:
    """Complete scorecard output for a channel."""

    channel_title: str
    channel_url: str
    channel_thumbnail_url: str | None
    generated_at: datetime
    overall_score: float
    components: ScoreComponents
    totals: ScorecardTotals
    videos: list[VideoBreakdown]


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    """Parse CLI arguments."""

    parser = argparse.ArgumentParser(
        description="Calculate Storyloop's growth scorecard for a YouTube channel.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "channel",
        help="YouTube channel handle, vanity URL, channel ID, or video link.",
    )
    parser.add_argument(
        "--api-key",
        dest="api_key",
        help="YouTube Data API key (falls back to YOUTUBE_API_KEY).",
    )
    parser.add_argument(
        "--max-results",
        dest="max_results",
        type=int,
        default=12,
        help="Number of recent uploads to analyse (1-50).",
    )
    parser.add_argument(
        "--json",
        dest="as_json",
        action="store_true",
        help="Emit the scorecard as JSON instead of human-readable text.",
    )
    parser.add_argument(
        "--log-level",
        default="WARNING",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        help="Set the logging verbosity for troubleshooting.",
    )

    args = parser.parse_args(argv)
    if args.max_results < 1 or args.max_results > 50:
        parser.error("--max-results must be between 1 and 50")

    return args


def resolve_api_key(cli_value: str | None) -> str:
    """Resolve the API key from CLI or environment variables."""

    if cli_value:
        return cli_value

    env_value = os.getenv("YOUTUBE_API_KEY")
    if env_value:
        return env_value

    raise YoutubeConfigurationError(
        "Provide a YouTube Data API key via --api-key or YOUTUBE_API_KEY."
    )


async def fetch_feed_with_metrics(
    service: YoutubeService, channel: str, max_results: int
) -> tuple[YoutubeFeed, dict[str, YoutubeVideoStatistics]]:
    """Retrieve the channel feed and statistics for its uploads."""

    feed = await service.fetch_channel_videos(channel, max_results=max_results)
    video_ids = [video.id for video in feed.videos]
    stats = await service.fetch_video_statistics(video_ids)
    return feed, stats


def compute_scorecard(
    feed: YoutubeFeed,
    statistics: dict[str, YoutubeVideoStatistics],
    *,
    now: datetime | None = None,
) -> ScorecardResult:
    """Aggregate video metrics into a scorecard summary."""

    timestamp = ensure_aware(now or datetime.now(UTC))

    breakdowns: list[VideoBreakdown] = []
    published_dates: list[datetime] = []
    for video in feed.videos:
        published_at = ensure_aware(video.published_at)
        published_dates.append(published_at)
        stats = statistics.get(video.id)
        if stats is None:
            continue
        view_velocity = compute_view_velocity(stats.view_count, published_at, timestamp)
        engagement_rate = compute_engagement_rate(
            stats.view_count, stats.like_count, stats.comment_count
        )
        breakdowns.append(
            VideoBreakdown(
                video_id=video.id,
                title=video.title,
                url=video.url,
                published_at=published_at,
                view_count=stats.view_count,
                view_velocity=view_velocity,
                engagement_rate=engagement_rate,
            )
        )

    if not breakdowns:
        raise YoutubeAPIRequestError(
            "No usable metrics were returned for the requested channel."
        )

    overall_score, components = calculate_scores(breakdowns, published_dates)
    totals = calculate_totals(breakdowns, published_dates, timestamp)

    breakdowns.sort(key=lambda item: item.published_at, reverse=True)

    return ScorecardResult(
        channel_title=feed.channel_title,
        channel_url=feed.channel_url,
        channel_thumbnail_url=feed.channel_thumbnail_url,
        generated_at=timestamp,
        overall_score=overall_score,
        components=components,
        totals=totals,
        videos=breakdowns,
    )


def calculate_scores(
    breakdowns: Sequence[VideoBreakdown],
    published_dates: Sequence[datetime],
) -> tuple[float, ScoreComponents]:
    """Compute subscores and the overall growth score."""

    view_velocity_score = normalise_view_velocity(
        fmean(item.view_velocity for item in breakdowns)
    )
    engagement_score = normalise_engagement(
        fmean(item.engagement_rate for item in breakdowns)
    )
    consistency_score = normalise_consistency(
        compute_average_upload_interval(published_dates)
    )

    overall_score = (
        0.5 * view_velocity_score
        + 0.3 * engagement_score
        + 0.2 * consistency_score
    )

    return (
        round(overall_score, 1),
        ScoreComponents(
            view_velocity=round(view_velocity_score, 1),
            engagement=round(engagement_score, 1),
            consistency=round(consistency_score, 1),
        ),
    )


def calculate_totals(
    breakdowns: Sequence[VideoBreakdown],
    published_dates: Sequence[datetime],
    now: datetime,
) -> ScorecardTotals:
    """Build aggregate metrics displayed alongside the score."""

    total_views = sum(item.view_count for item in breakdowns)
    average_views = fmean(item.view_count for item in breakdowns)
    average_velocity = fmean(item.view_velocity for item in breakdowns)
    average_engagement = fmean(item.engagement_rate for item in breakdowns)
    uploads_per_week = compute_uploads_per_week(published_dates, now)
    average_interval = compute_average_upload_interval(published_dates)

    return ScorecardTotals(
        analyzed_uploads=len(breakdowns),
        total_views=total_views,
        average_views=round(average_views, 2),
        average_view_velocity=round(average_velocity, 2),
        average_engagement_rate=round(average_engagement, 4),
        uploads_per_week=round(uploads_per_week, 2),
        average_upload_interval_days=round(average_interval, 2)
        if average_interval is not None
        else None,
    )


def compute_view_velocity(view_count: int, published_at: datetime, now: datetime) -> float:
    """Calculate the number of views accrued per day."""

    elapsed_days = max((now - published_at).total_seconds() / 86400.0, 0.25)
    return view_count / elapsed_days


def compute_engagement_rate(
    view_count: int, like_count: int | None, comment_count: int | None
) -> float:
    """Calculate the engagement rate (likes + comments) per view."""

    if view_count <= 0:
        return 0.0
    engagement_total = max(like_count or 0, 0) + max(comment_count or 0, 0)
    return engagement_total / view_count


def compute_uploads_per_week(
    published_dates: Sequence[datetime], now: datetime
) -> float:
    """Approximate uploads per week based on the analysed period."""

    if not published_dates:
        return 0.0

    earliest = min(published_dates)
    span_days = max((now - earliest).total_seconds() / 86400.0, 1.0)
    uploads_per_day = len(published_dates) / span_days
    return uploads_per_day * 7.0


def compute_average_upload_interval(
    published_dates: Sequence[datetime],
) -> float | None:
    """Return the average interval between uploads in days."""

    if len(published_dates) <= 1:
        return None

    ordered = sorted(published_dates)
    deltas: list[float] = []
    for current, previous in zip(ordered[1:], ordered[:-1]):
        delta = (current - previous).total_seconds() / 86400.0
        if delta > 0:
            deltas.append(delta)
    if not deltas:
        return None
    return fmean(deltas)


def normalise_view_velocity(value: float) -> float:
    """Map average view velocity to a 0-100 score."""

    reference = 5000.0
    if value <= 0:
        return 0.0
    score = math.log1p(value) / math.log1p(reference)
    return clamp(score * 100.0)


def normalise_engagement(value: float) -> float:
    """Map engagement rate (0-1) to a 0-100 score."""

    target = 0.08  # 8% combined like/comment rate is excellent for most channels
    if value <= 0:
        return 0.0
    score = value / target
    return clamp(score * 100.0)


def normalise_consistency(avg_interval: float | None) -> float:
    """Translate upload cadence into a subscore."""

    if avg_interval is None:
        return 100.0
    target = 7.0
    max_interval = 28.0
    if avg_interval <= target:
        return 100.0
    if avg_interval >= max_interval:
        return 0.0
    ratio = (max_interval - avg_interval) / (max_interval - target)
    return clamp(ratio * 100.0)


def clamp(value: float, lower: float = 0.0, upper: float = 100.0) -> float:
    """Clamp value between bounds."""

    return max(lower, min(upper, value))


def ensure_aware(moment: datetime) -> datetime:
    """Ensure a datetime is timezone-aware in UTC."""

    if moment.tzinfo is None:
        return moment.replace(tzinfo=UTC)
    return moment.astimezone(UTC)


def scorecard_to_dict(result: ScorecardResult) -> dict[str, object]:
    """Convert a scorecard result into a JSON-serialisable dictionary."""

    payload = asdict(result)
    payload["generated_at"] = result.generated_at.isoformat()
    payload["videos"] = [
        {
            **video_dict,
            "published_at": video.published_at.isoformat(),
        }
        for video_dict, video in zip(payload["videos"], result.videos)
    ]
    return payload


def render_scorecard(result: ScorecardResult) -> str:
    """Format the scorecard for human consumption."""

    lines = [
        f"Channel: {result.channel_title}",
        f"URL: {result.channel_url}",
        f"Generated at: {result.generated_at.isoformat()}",
        "",
        f"Growth Score: {result.overall_score:.1f}/100",
        "Components:",
        f"  • View velocity: {result.components.view_velocity:.1f}",
        f"  • Engagement: {result.components.engagement:.1f}",
        f"  • Consistency: {result.components.consistency:.1f}",
        "",
        "Totals:",
        f"  • Analyzed uploads: {result.totals.analyzed_uploads}",
        f"  • Total views: {result.totals.total_views:,}",
        f"  • Average views: {result.totals.average_views:,.2f}",
        f"  • Avg view velocity: {result.totals.average_view_velocity:,.2f} views/day",
        f"  • Avg engagement rate: {result.totals.average_engagement_rate:.2%}",
        f"  • Uploads/week: {result.totals.uploads_per_week:.2f}",
    ]
    if result.totals.average_upload_interval_days is not None:
        lines.append(
            "  • Avg upload interval: "
            f"{result.totals.average_upload_interval_days:.2f} days"
        )
    lines.append("")
    lines.append("Recent uploads:")
    for video in result.videos[:5]:
        lines.append(
            "  • "
            f"{video.published_at.date()} — {video.view_count:,} views, "
            f"{video.view_velocity:,.0f} views/day, "
            f"{video.engagement_rate:.2%} engagement — {video.title}"
        )
    return "\n".join(lines)


async def run(argv: Sequence[str] | None = None) -> int:
    """Entry point for the async workflow."""

    args = parse_args(argv)
    logging.basicConfig(level=getattr(logging, args.log_level))

    try:
        api_key = resolve_api_key(args.api_key)
        service = YoutubeService(api_key=api_key)
        feed, stats = await fetch_feed_with_metrics(
            service, args.channel, args.max_results
        )
        scorecard = compute_scorecard(feed, stats)
    except YoutubeChannelNotFound as error:
        logging.error("Channel not found: %s", error)
        return 1
    except YoutubeConfigurationError as error:
        logging.error("Configuration error: %s", error)
        return 2
    except YoutubeAPIRequestError as error:
        logging.error("YouTube API error: %s", error)
        return 3

    if args.as_json:
        print(json.dumps(scorecard_to_dict(scorecard), indent=2))
    else:
        print(render_scorecard(scorecard))

    return 0


def main(argv: Sequence[str] | None = None) -> None:
    """CLI entry point."""

    exit_code = asyncio.run(run(argv))
    raise SystemExit(exit_code)


if __name__ == "__main__":  # pragma: no cover - CLI entry
    main()
