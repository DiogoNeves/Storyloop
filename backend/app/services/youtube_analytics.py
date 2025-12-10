"""YouTube Analytics API integration for video performance metrics.

This module provides access to YouTube Analytics API data for calculating the Storyloop
Growth Index (SGI). It fetches metrics like average view percentage, subscriber changes,
and view velocity that are required for the SGI formula.

Key metrics available via YouTube Analytics API:
- views: Daily/total views (for VV7/VV28 calculation)
- averageViewPercentage: Average percentage of video watched
- subscribersGained/subscribersLost: Subscriber changes per video

Note: relativeRetentionPerformance (Early Hook Score) is NOT available in the public
Analytics API - it's a YouTube Studio internal metric. The SGI retention formula
uses AVP at full weight when EHS is unavailable.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

import anyio
from cachetools import TTLCache
from googleapiclient.discovery import build

if TYPE_CHECKING:
    from app.services.users import UserService
    from app.services.youtube_oauth import YoutubeOAuthService

logger = logging.getLogger(__name__)

ANALYTICS_CACHE_TTL = 600  # 10 minutes
ANALYTICS_CACHE_SIZE = 256


@dataclass(slots=True)
class VideoAnalytics:
    """Analytics metrics for a single YouTube video.

    These metrics are used to calculate the Storyloop Growth Index components:
    - Discovery: Uses views_7d for View Velocity 7d
    - Retention: Uses average_view_percentage
    - Loyalty: Uses subscribers_gained, subscribers_lost, and views_28d for SPV
    """

    video_id: str
    average_view_percentage: float | None
    subscribers_gained: int | None
    subscribers_lost: int | None
    views_7d: int | None
    views_28d: int | None


class YoutubeAnalyticsService:
    """Service for fetching YouTube Analytics API data with caching."""

    def __init__(
        self,
        user_service: UserService,
        oauth_service: YoutubeOAuthService | None,
    ) -> None:
        self._user_service = user_service
        self._oauth_service = oauth_service
        self._response_cache: TTLCache[str, VideoAnalytics] = TTLCache(
            maxsize=ANALYTICS_CACHE_SIZE, ttl=ANALYTICS_CACHE_TTL
        )

    async def fetch_video_analytics(
        self, video_id: str, published_at: datetime
    ) -> VideoAnalytics:
        """Fetch analytics metrics for a single video.

        Args:
            video_id: YouTube video ID.
            published_at: Video publish date (used to calculate date ranges).

        Returns:
            VideoAnalytics with available metrics, None values for unavailable data.
        """
        cache_key = f"video:{video_id}"
        cached = self._response_cache.get(cache_key)
        if cached is not None:
            return cached

        result = await self._fetch_analytics_authenticated(video_id, published_at)
        self._response_cache[cache_key] = result
        return result

    async def fetch_videos_analytics(
        self, videos: list[tuple[str, datetime]]
    ) -> dict[str, VideoAnalytics]:
        """Fetch analytics for multiple videos.

        Args:
            videos: List of (video_id, published_at) tuples.

        Returns:
            Dict mapping video_id to VideoAnalytics.
        """
        results: dict[str, VideoAnalytics] = {}

        async def fetch_one(video_id: str, published_at: datetime) -> None:
            analytics = await self.fetch_video_analytics(video_id, published_at)
            results[video_id] = analytics

        async with anyio.create_task_group() as tg:
            for video_id, published_at in videos:
                tg.start_soon(fetch_one, video_id, published_at)

        return results

    async def _fetch_analytics_authenticated(
        self, video_id: str, published_at: datetime
    ) -> VideoAnalytics:
        """Fetch analytics using OAuth credentials."""
        credentials = await self._get_credentials()
        if credentials is None:
            logger.debug("No OAuth credentials available for analytics")
            return VideoAnalytics(
                video_id=video_id,
                average_view_percentage=None,
                subscribers_gained=None,
                subscribers_lost=None,
                views_7d=None,
                views_28d=None,
            )

        return await anyio.to_thread.run_sync(
            lambda: self._fetch_analytics_sync(credentials, video_id, published_at)
        )

    def _fetch_analytics_sync(
        self, credentials: Any, video_id: str, published_at: datetime
    ) -> VideoAnalytics:
        """Synchronous analytics fetch (runs in thread pool)."""
        try:
            service = build("youtubeAnalytics", "v2", credentials=credentials)

            now = datetime.now(tz=UTC)
            start_date = published_at.strftime("%Y-%m-%d")

            # For 7-day metrics
            end_date_7d = min(published_at + timedelta(days=6), now)

            # For 28-day metrics
            end_date_28d = min(published_at + timedelta(days=27), now)
            end_date_28d_str = end_date_28d.strftime("%Y-%m-%d")

            # Fetch 28-day window (includes 7-day data)
            response = (
                service.reports()
                .query(
                    ids="channel==MINE",
                    startDate=start_date,
                    endDate=end_date_28d_str,
                    metrics="views,averageViewPercentage,subscribersGained,subscribersLost",
                    dimensions="day",
                    filters=f"video=={video_id}",
                )
                .execute()
            )

            return self._parse_analytics_response(
                video_id, response, published_at, end_date_7d
            )

        except Exception as e:
            logger.warning(f"Failed to fetch analytics for {video_id}: {e}")
            return VideoAnalytics(
                video_id=video_id,
                average_view_percentage=None,
                subscribers_gained=None,
                subscribers_lost=None,
                views_7d=None,
                views_28d=None,
            )

    def _parse_analytics_response(
        self,
        video_id: str,
        response: dict[str, Any],
        published_at: datetime,
        end_date_7d: datetime,
    ) -> VideoAnalytics:
        """Parse Analytics API response into VideoAnalytics."""
        rows = response.get("rows", [])
        if not rows:
            return VideoAnalytics(
                video_id=video_id,
                average_view_percentage=None,
                subscribers_gained=None,
                subscribers_lost=None,
                views_7d=None,
                views_28d=None,
            )

        # Column headers tell us the order: day, views, averageViewPercentage, subscribersGained, subscribersLost
        column_headers = response.get("columnHeaders", [])
        col_map = {h["name"]: i for i, h in enumerate(column_headers)}

        views_7d = 0
        views_28d = 0
        total_avp_weighted = 0.0
        total_subs_gained = 0
        total_subs_lost = 0

        for row in rows:
            day_str = row[col_map.get("day", 0)]
            try:
                row_date = datetime.strptime(day_str, "%Y-%m-%d").replace(tzinfo=UTC)
            except (ValueError, TypeError):
                continue

            views = int(row[col_map.get("views", 1)] or 0)
            avp = float(row[col_map.get("averageViewPercentage", 2)] or 0)
            subs_gained = int(row[col_map.get("subscribersGained", 3)] or 0)
            subs_lost = int(row[col_map.get("subscribersLost", 4)] or 0)

            views_28d += views
            total_subs_gained += subs_gained
            total_subs_lost += subs_lost
            total_avp_weighted += avp * views

            if row_date <= end_date_7d:
                views_7d += views

        # Weighted average AVP (weight by views per day)
        average_view_percentage = (
            (total_avp_weighted / views_28d) if views_28d > 0 else None
        )

        return VideoAnalytics(
            video_id=video_id,
            average_view_percentage=average_view_percentage,
            subscribers_gained=total_subs_gained if total_subs_gained > 0 else None,
            subscribers_lost=total_subs_lost if total_subs_lost > 0 else None,
            views_7d=views_7d if views_7d > 0 else None,
            views_28d=views_28d if views_28d > 0 else None,
        )

    async def _get_credentials(self) -> Any | None:
        """Get OAuth credentials from user service."""
        if self._oauth_service is None:
            return None

        user = await anyio.to_thread.run_sync(self._user_service.get_active_user)
        if user is None or user.credentials_json is None:
            return None

        try:
            credentials = self._oauth_service.deserialize_credentials(
                user.credentials_json
            )
            if credentials.expired and credentials.refresh_token:
                self._oauth_service.refresh_credentials(credentials)
                # Update stored credentials
                serialized = self._oauth_service.serialize_credentials(credentials)
                await anyio.to_thread.run_sync(
                    lambda: self._user_service.upsert_credentials(user.id, serialized)
                )
            return credentials
        except Exception as e:
            logger.warning(f"Failed to get OAuth credentials: {e}")
            return None


__all__ = ["VideoAnalytics", "YoutubeAnalyticsService"]
