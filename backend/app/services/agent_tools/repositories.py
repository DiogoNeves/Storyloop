from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol, runtime_checkable

import anyio

from app.services.assets import AssetService, extract_asset_ids
from app.services.entries import EntryService
from app.services.users import UserService
from app.services.youtube import YoutubeService
from app.services.agent_tools.models import (
    ChannelMetrics,
    GrowthScoreResult,
    JournalEntry,
    JournalEntryAttachment,
    VideoAnalyticsMetrics,
    VideoDetails,
    VideoMetrics,
)
from app.services.youtube_analytics import YoutubeAnalyticsService
from app.services.youtube_oauth import YoutubeOAuthService


class JournalRepository:
    """Readonly accessors for journal entries scoped to the current user."""

    def __init__(
        self,
        entry_service: EntryService,
        asset_service: AssetService | None = None,
    ) -> None:
        self._entry_service = entry_service
        self._asset_service = asset_service

    async def load_entries(
        self, *, user_id: str, limit: int, before: str | None
    ) -> list[JournalEntry]:
        """Return journal entries ordered by recency.

        Args:
            user_id: Identifier for the user requesting entries (currently informational).
            limit: Maximum number of entries to return.
            before: ISO 8601 timestamp string that filters out newer entries.
        """

        def _fetch() -> list[JournalEntry]:
            records = self._entry_service.list_entries()
            filtered = [
                record
                for record in records
                if record.category == "journal"
            ]
            if before:
                try:
                    cutoff = datetime.fromisoformat(before)
                    filtered = [
                        record
                        for record in filtered
                        if record.occurred_at < cutoff
                    ]
                except ValueError:
                    # Ignore malformed timestamps; return unfiltered results.
                    pass
            filtered.sort(key=lambda record: record.occurred_at, reverse=True)
            limited = filtered[:limit]
            return [
                JournalEntry(
                    id=record.id,
                    title=record.title,
                    created_at=record.occurred_at.isoformat(),
                    text=record.summary,
                    attachments=_collect_attachments(
                        self._asset_service, record.summary
                    ),
                )
                for record in limited
            ]

        return await anyio.to_thread.run_sync(_fetch)


@runtime_checkable
class BaseJournalRepository(Protocol):
    """Interface for journal repositories consumed by the agent."""

    async def load_entries(
        self, *, user_id: str, limit: int, before: str | None
    ) -> list[JournalEntry]:
        """Return journal entries ordered by recency."""


class EmptyJournalRepository:
    """Fallback repository returning no journal entries."""

    async def load_entries(
        self, *, user_id: str, limit: int, before: str | None
    ) -> list[JournalEntry]:
        return []


def _collect_attachments(
    asset_service: AssetService | None, summary: str
) -> list[JournalEntryAttachment]:
    if asset_service is None or not summary:
        return []

    asset_ids = extract_asset_ids(summary)
    if not asset_ids:
        return []

    records = asset_service.list_records(asset_ids)
    record_map = {record.id: record for record in records}
    attachments: list[JournalEntryAttachment] = []
    for asset_id in asset_ids:
        record = record_map.get(asset_id)
        if record is None:
            continue
        meta = asset_service.get_meta(asset_id)
        attachments.append(
            JournalEntryAttachment(
                id=record.id,
                filename=record.original_filename,
                mime_type=record.mime_type,
                url=asset_service.resolve_url(record.id),
                width=meta.width if meta else None,
                height=meta.height if meta else None,
                extracted_text=record.extracted_text,
            )
        )
    return attachments


class YouTubeRepository:
    """Readonly accessors for YouTube data exposed to the agent."""

    def __init__(
        self,
        youtube_service: YoutubeService,
        user_service: UserService,
        oauth_service: YoutubeOAuthService | None,
        analytics_service: YoutubeAnalyticsService | None = None,
    ) -> None:
        self._youtube_service = youtube_service
        self._user_service = user_service
        self._oauth_service = oauth_service
        self._analytics_service = analytics_service

    async def _get_active_user(self) -> Any:
        return await anyio.to_thread.run_sync(self._user_service.get_active_user)

    async def list_recent_videos(
        self,
        *,
        limit: int = 25,
        include_shorts: bool = False,
        published_after: str | None = None,
        published_before: str | None = None,
    ) -> list[VideoDetails]:
        """Return recent videos for the active channel.

        Shorts are excluded by default to prioritize long-form context.

        Args:
            limit: Maximum number of videos to return.
            include_shorts: Whether to include YouTube Shorts.
            published_after: Only include videos published on or after this ISO date.
            published_before: Only include videos published before this ISO date.
        """

        active_user = await self._get_active_user()
        channel_identifier = active_user.channel_id if active_user else None
        if channel_identifier is None:
            return []

        # Request more videos than limit to account for date filtering
        fetch_limit = limit * 2 if (published_after or published_before) else limit
        fetch_limit = max(fetch_limit, 50)  # Fetch at least 50 for filtering

        video_type = None if include_shorts else "video"
        feed = await self._youtube_service.fetch_channel_feed(
            channel_identifier,
            video_type=video_type,
            user_service=self._user_service,
            oauth_service=self._oauth_service,
            max_results=fetch_limit,
        )

        videos = [
            video for video in feed.videos if include_shorts or video.video_type == "video"
        ]

        # Apply date filtering
        if published_after:
            try:
                cutoff = datetime.fromisoformat(published_after.replace("Z", "+00:00"))
                videos = [v for v in videos if v.published_at >= cutoff]
            except ValueError:
                pass  # Ignore malformed timestamps

        if published_before:
            try:
                cutoff = datetime.fromisoformat(published_before.replace("Z", "+00:00"))
                videos = [v for v in videos if v.published_at < cutoff]
            except ValueError:
                pass  # Ignore malformed timestamps

        # Apply limit after filtering
        videos = videos[:limit]

        return [
            VideoDetails(
                video_id=video.id,
                title=video.title,
                description=video.description,
                url=video.url,
                published_at=video.published_at.isoformat(),
                video_type=video.video_type,
                tags=[],
            )
            for video in videos
        ]

    async def get_video(self, video_id: str) -> VideoDetails:
        """Return detailed metadata for a single video."""

        video = await self._youtube_service.fetch_video_detail(
            video_id,
            user_service=self._user_service,
            oauth_service=self._oauth_service,
        )
        return VideoDetails(
            video_id=video.id,
            title=video.title,
            description=video.description,
            url=video.url,
            published_at=video.published_at.isoformat(),
            video_type=video.video_type,
            tags=[],
        )

    async def get_video_metrics(self, video_id: str) -> VideoMetrics:
        """Return available metrics for a single video.

        Fetches real statistics from the YouTube Data API including
        view count, like count, and comment count.
        """

        video = await self._youtube_service.fetch_video_detail(
            video_id,
            user_service=self._user_service,
            oauth_service=self._oauth_service,
        )
        stats = video.statistics
        return VideoMetrics(
            video_id=video.id,
            view_count=stats.view_count if stats else None,
            like_count=stats.like_count if stats else None,
            comment_count=stats.comment_count if stats else None,
        )

    async def get_channel_metrics(self) -> ChannelMetrics:
        """Return metrics for the active channel.

        Fetches real statistics from the YouTube Data API including
        view count, subscriber count, and video count.
        """

        active_user = await self._get_active_user()
        channel_id = active_user.channel_id if active_user else None
        if channel_id is None:
            raise RuntimeError("No active channel configured")

        stats = await self._youtube_service.fetch_channel_statistics(
            channel_id,
            user_service=self._user_service,
            oauth_service=self._oauth_service,
        )
        return ChannelMetrics(
            channel_id=channel_id,
            view_count=stats.view_count,
            subscriber_count=stats.subscriber_count,
            video_count=stats.video_count,
        )

    async def get_video_analytics(self, video_id: str) -> VideoAnalyticsMetrics:
        """Return analytics metrics for a single video.

        Fetches data from YouTube Analytics API including average view percentage,
        subscriber changes, and view velocity metrics.
        """
        if self._analytics_service is None:
            return VideoAnalyticsMetrics(video_id=video_id)

        video = await self._youtube_service.fetch_video_detail(
            video_id,
            user_service=self._user_service,
            oauth_service=self._oauth_service,
        )

        analytics = await self._analytics_service.fetch_video_analytics(
            video_id, video.published_at
        )

        return VideoAnalyticsMetrics(
            video_id=video_id,
            average_view_percentage=analytics.average_view_percentage,
            subscribers_gained=analytics.subscribers_gained,
            subscribers_lost=analytics.subscribers_lost,
            views_7d=analytics.views_7d,
            views_28d=analytics.views_28d,
        )

    async def get_channel_growth_score(self) -> GrowthScoreResult:
        """Return the current Storyloop Growth Index for the active channel."""
        from app.services.growth import GrowthScoreService

        active_user = await self._get_active_user()
        channel_id = active_user.channel_id if active_user else None
        if channel_id is None:
            raise RuntimeError("No active channel configured")

        if self._analytics_service is None:
            raise RuntimeError("Analytics service not configured")

        growth_service = GrowthScoreService()
        computation = await growth_service.load_latest_score(
            channel_id=channel_id,
            video_type=None,
            youtube_service=self._youtube_service,
            analytics_service=self._analytics_service,
            user_service=self._user_service,
            oauth_service=self._oauth_service,
        )

        return GrowthScoreResult(
            total_score=computation.total_score,
            score_delta=computation.score_delta,
            is_early_channel=computation.is_early_channel,
            discovery_score=computation.breakdown.discovery.score,
            retention_score=computation.breakdown.retention.score,
            loyalty_score=computation.breakdown.loyalty.score,
        )


@runtime_checkable
class BaseYouTubeRepository(Protocol):
    """Interface for YouTube repositories consumed by the agent."""

    async def list_recent_videos(
        self,
        *,
        limit: int = 25,
        include_shorts: bool = False,
        published_after: str | None = None,
        published_before: str | None = None,
    ) -> list[VideoDetails]:
        """Return recent videos for the active channel."""

    async def get_video(self, video_id: str) -> VideoDetails:
        """Return detailed metadata for a single video."""

    async def get_video_metrics(self, video_id: str) -> VideoMetrics:
        """Return metrics for a specific video."""

    async def get_channel_metrics(self) -> ChannelMetrics:
        """Return metrics for the active channel."""

    async def get_video_analytics(self, video_id: str) -> VideoAnalyticsMetrics:
        """Return analytics metrics for a specific video."""

    async def get_channel_growth_score(self) -> GrowthScoreResult:
        """Return the growth score for the active channel."""


class EmptyYouTubeRepository:
    """Fallback repository returning empty YouTube data."""

    async def list_recent_videos(
        self,
        *,
        limit: int = 25,
        include_shorts: bool = False,
        published_after: str | None = None,
        published_before: str | None = None,
    ) -> list[VideoDetails]:
        return []

    async def get_video(self, video_id: str) -> VideoDetails:
        raise RuntimeError("YouTube service not configured")

    async def get_video_metrics(self, video_id: str) -> VideoMetrics:
        raise RuntimeError("YouTube service not configured")

    async def get_channel_metrics(self) -> ChannelMetrics:
        raise RuntimeError("YouTube service not configured")

    async def get_video_analytics(self, video_id: str) -> VideoAnalyticsMetrics:
        raise RuntimeError("YouTube service not configured")

    async def get_channel_growth_score(self) -> GrowthScoreResult:
        raise RuntimeError("YouTube service not configured")
