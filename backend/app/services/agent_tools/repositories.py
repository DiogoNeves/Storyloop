from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol, runtime_checkable

import anyio

from app.services.entries import EntryService
from app.services.users import UserService
from app.services.youtube import YoutubeService
from app.services.agent_tools.models import JournalEntry, VideoDetails, VideoMetrics
from app.services.youtube_oauth import YoutubeOAuthService


class JournalRepository:
    """Readonly accessors for journal entries scoped to the current user."""

    def __init__(self, entry_service: EntryService) -> None:
        self._entry_service = entry_service

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


class YouTubeRepository:
    """Readonly accessors for YouTube data exposed to the agent."""

    def __init__(
        self,
        youtube_service: YoutubeService,
        user_service: UserService,
        oauth_service: YoutubeOAuthService | None,
    ) -> None:
        self._youtube_service = youtube_service
        self._user_service = user_service
        self._oauth_service = oauth_service

    async def _get_active_user(self) -> Any:
        return await anyio.to_thread.run_sync(self._user_service.get_active_user)

    async def list_recent_videos(
        self, *, limit: int = 5, include_shorts: bool = False
    ) -> list[VideoDetails]:
        """Return recent videos for the active channel.

        Shorts are excluded by default to prioritize long-form context.
        """

        active_user = await self._get_active_user()
        channel_identifier = active_user.channel_id if active_user else None
        if channel_identifier is None:
            return []

        video_type = None if include_shorts else "video"
        feed = await self._youtube_service.fetch_channel_feed(
            channel_identifier,
            video_type=video_type,
            user_service=self._user_service,
            oauth_service=self._oauth_service,
            max_results=max(limit, 5),
        )
        videos = [
            video for video in feed.videos if include_shorts or video.video_type == "video"
        ][:limit]
        return [
            VideoDetails(
                video_id=video.id,
                title=video.title,
                description=video.description,
                url=video.url,
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
            tags=[],
        )

    async def get_video_metrics(self, video_id: str) -> VideoMetrics:
        """Return available metrics for a single video.

        Metrics synchronization is not yet implemented; this method returns a
        structured placeholder anchored to real video metadata to avoid
        hallucination.
        """

        video = await self._youtube_service.fetch_video_detail(
            video_id,
            user_service=self._user_service,
            oauth_service=self._oauth_service,
        )
        return VideoMetrics(
            video_id=video.id,
            notes=(
                "Metrics collection is not yet available; this placeholder is"
                " grounded in the retrieved video data."
            ),
        )


@runtime_checkable
class BaseYouTubeRepository(Protocol):
    """Interface for YouTube repositories consumed by the agent."""

    async def list_recent_videos(
        self, *, limit: int = 5, include_shorts: bool = False
    ) -> list[VideoDetails]:
        """Return recent videos for the active channel."""

    async def get_video(self, video_id: str) -> VideoDetails:
        """Return detailed metadata for a single video."""

    async def get_video_metrics(self, video_id: str) -> VideoMetrics:
        """Return metrics for a specific video."""


class EmptyYouTubeRepository:
    """Fallback repository returning empty YouTube data."""

    async def list_recent_videos(
        self, *, limit: int = 5, include_shorts: bool = False
    ) -> list[VideoDetails]:
        return []

    async def get_video(self, video_id: str) -> VideoDetails:
        raise RuntimeError("YouTube service not configured")

    async def get_video_metrics(self, video_id: str) -> VideoMetrics:
        raise RuntimeError("YouTube service not configured")
