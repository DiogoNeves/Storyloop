from __future__ import annotations

from datetime import UTC, datetime
from hashlib import blake2s
from typing import Any, Protocol, runtime_checkable
from uuid import uuid4

import anyio

from app.services.assets import AssetService, extract_asset_ids
from app.services.entries import EntryRecord, EntryService
from app.services.agent_tools.models import (
    ChannelMetrics,
    EntryDetails,
    JournalEntry,
    JournalEntryAttachment,
    JournalEntryDetails,
    JournalEntryInput,
    TodayChecklistItem,
    TodayEntry,
    VideoCountResult,
    VideoAnalyticsMetrics,
    VideoDetails,
    VideoMetrics,
)
from app.services.tags import extract_tags_from_values
from app.services.today_entries import parse_today_summary
from app.services.users import UserService
from app.services.youtube import YoutubeService
from app.services.youtube_analytics import YoutubeAnalyticsService
from app.services.youtube_oauth import YoutubeOAuthService


def _normalize_title(title: str) -> str:
    return title.strip()


def _normalize_content(content_markdown: str) -> str:
    return content_markdown.strip()


def _calculate_content_hash(title: str, content_markdown: str) -> str:
    normalized_title = _normalize_title(title)
    normalized_content = _normalize_content(content_markdown)
    payload = f"{normalized_title}\n{normalized_content}".encode("utf-8")
    return blake2s(payload).hexdigest()[:12]


def _to_journal_details(record: EntryRecord) -> JournalEntryDetails:
    return JournalEntryDetails(
        id=record.id,
        title=record.title,
        content_markdown=record.summary,
        occurred_at=record.occurred_at.isoformat(),
        content_hash=_calculate_content_hash(record.title, record.summary),
        pinned=record.pinned,
        tags=extract_tags_from_values(
            record.title, record.summary, record.prompt_body
        ),
    )


def _to_journal_entry(
    record: EntryRecord, asset_service: AssetService | None
) -> JournalEntry:
    return JournalEntry(
        id=record.id,
        title=record.title,
        created_at=record.occurred_at.isoformat(),
        updated_at=record.updated_at.isoformat(),
        text=record.summary,
        pinned=record.pinned,
        tags=extract_tags_from_values(
            record.title, record.summary, record.prompt_body
        ),
        attachments=_collect_attachments(asset_service, record.summary),
    )


def _parse_today_tasks(
    summary_markdown: str,
) -> tuple[list[TodayChecklistItem], list[str], list[str]]:
    try:
        rows = parse_today_summary(summary_markdown)
    except ValueError:
        return [], [], []

    checklist = [
        TodayChecklistItem(text=row.text, checked=row.checked)
        for row in rows
        if row.text
    ]
    completed_tasks = [item.text for item in checklist if item.checked]
    pending_tasks = [item.text for item in checklist if not item.checked]
    return checklist, completed_tasks, pending_tasks


def _to_today_entry(record: EntryRecord) -> TodayEntry:
    checklist, completed_tasks, pending_tasks = _parse_today_tasks(
        record.summary
    )
    return TodayEntry(
        id=record.id,
        title=record.title,
        created_at=record.occurred_at.isoformat(),
        updated_at=record.updated_at.isoformat(),
        summary_markdown=record.summary,
        checklist=checklist,
        completed_tasks=completed_tasks,
        pending_tasks=pending_tasks,
        pinned=record.pinned,
        tags=extract_tags_from_values(
            record.title, record.summary, record.prompt_body
        ),
    )


def _is_archived_entry(record: EntryRecord) -> bool:
    return bool(record.archived)


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
            before: ISO 8601 timestamp string that filters by updated_at.
        """

        def _fetch() -> list[JournalEntry]:
            records = self._entry_service.list_entries(include_archived=False)
            filtered = [
                record
                for record in records
                if record.category == "journal"
            ]
            if before:
                cutoff = _parse_iso_datetime(before)
                if cutoff is not None:
                    filtered = [
                        record
                        for record in filtered
                        if record.updated_at < cutoff
                    ]
            filtered.sort(
                key=lambda record: (record.pinned, record.updated_at),
                reverse=True,
            )
            limited = filtered[:limit]
            return [
                _to_journal_entry(record, self._asset_service)
                for record in limited
            ]

        return await anyio.to_thread.run_sync(_fetch)

    async def search_entries(
        self, *, user_id: str, keyword: str, limit: int = 10
    ) -> list[JournalEntry]:
        """Search journal entries by keyword."""

        def _fetch() -> list[JournalEntry]:
            if limit <= 0:
                return []

            records = self._entry_service.search_entries(
                keyword=keyword,
                category="journal",
                limit=limit,
                include_archived=False,
            )
            return [
                _to_journal_entry(record, self._asset_service)
                for record in records[:limit]
            ]

        return await anyio.to_thread.run_sync(_fetch)

    async def get_entry(self, entry_id: str) -> JournalEntryDetails:
        """Return a journal entry by identifier."""

        def _fetch() -> JournalEntryDetails:
            record = self._entry_service.get_entry(entry_id)
            if record is None:
                raise RuntimeError("Entry not found")
            if record.category != "journal":
                raise RuntimeError("Entry is not a journal entry")
            if _is_archived_entry(record):
                raise RuntimeError("Entry is archived")
            return _to_journal_details(record)

        return await anyio.to_thread.run_sync(_fetch)

    async def update_entry(
        self,
        entry_id: str,
        payload: JournalEntryInput,
        content_hash: str,
    ) -> JournalEntryDetails:
        """Update a journal entry if the content hash matches."""

        def _update() -> JournalEntryDetails:
            record = self._entry_service.get_entry(entry_id)
            if record is None:
                raise RuntimeError("Entry not found")
            if record.category != "journal":
                raise RuntimeError("Entry is not a journal entry")
            if _is_archived_entry(record):
                raise RuntimeError("Entry is archived")
            current_hash = _calculate_content_hash(record.title, record.summary)
            if current_hash != content_hash:
                raise RuntimeError(
                    "Entry changed since last read; you must read again before editing."
                )
            updated_record = EntryRecord(
                id=record.id,
                title=payload.title,
                summary=payload.content_markdown,
                prompt_body=record.prompt_body,
                prompt_format=record.prompt_format,
                occurred_at=record.occurred_at,
                updated_at=datetime.now(tz=UTC),
                last_smart_update_at=record.last_smart_update_at,
                last_opened_at=record.last_opened_at,
                category=record.category,
                link_url=record.link_url,
                thumbnail_url=record.thumbnail_url,
                video_id=record.video_id,
                pinned=payload.pinned
                if payload.pinned is not None
                else record.pinned,
                archived=record.archived,
            )
            updated = self._entry_service.update_entry(updated_record)
            if not updated:
                raise RuntimeError("Entry not found")
            return _to_journal_details(updated_record)

        return await anyio.to_thread.run_sync(_update)

    async def create_entry(
        self,
        payload: JournalEntryInput,
        occurred_at: datetime | None = None,
    ) -> JournalEntryDetails:
        """Create and return a new journal entry."""

        def _create() -> JournalEntryDetails:
            entry = EntryRecord(
                id=str(uuid4()),
                title=payload.title,
                summary=payload.content_markdown,
                prompt_body=None,
                prompt_format=None,
                occurred_at=occurred_at or datetime.now(tz=UTC),
                updated_at=datetime.now(tz=UTC),
                last_smart_update_at=None,
                last_opened_at=None,
                category="journal",
                pinned=payload.pinned if payload.pinned is not None else False,
                archived=False,
            )
            saved = self._entry_service.save_new_entries([entry])
            if not saved:
                raise RuntimeError("Entry already exists")
            return _to_journal_details(entry)

        return await anyio.to_thread.run_sync(_create)


@runtime_checkable
class BaseJournalRepository(Protocol):
    """Interface for journal repositories consumed by the agent."""

    async def load_entries(
        self, *, user_id: str, limit: int, before: str | None
    ) -> list[JournalEntry]:
        """Return journal entries ordered by recency."""

    async def get_entry(self, entry_id: str) -> JournalEntryDetails:
        """Return a journal entry by identifier."""

    async def search_entries(
        self, *, user_id: str, keyword: str, limit: int = 10
    ) -> list[JournalEntry]:
        """Search journal entries by keyword."""

    async def update_entry(
        self,
        entry_id: str,
        payload: JournalEntryInput,
        content_hash: str,
    ) -> JournalEntryDetails:
        """Update a journal entry if the content hash matches."""

    async def create_entry(
        self,
        payload: JournalEntryInput,
        occurred_at: datetime | None = None,
    ) -> JournalEntryDetails:
        """Create and return a new journal entry."""


class EmptyJournalRepository:
    """Fallback repository returning no journal entries."""

    async def load_entries(
        self, *, user_id: str, limit: int, before: str | None
    ) -> list[JournalEntry]:
        return []

    async def get_entry(self, entry_id: str) -> JournalEntryDetails:
        raise RuntimeError("Entry service not configured")

    async def search_entries(
        self, *, user_id: str, keyword: str, limit: int = 10
    ) -> list[JournalEntry]:
        return []

    async def update_entry(
        self,
        entry_id: str,
        payload: JournalEntryInput,
        content_hash: str,
    ) -> JournalEntryDetails:
        raise RuntimeError("Entry service not configured")

    async def create_entry(
        self,
        payload: JournalEntryInput,
        occurred_at: datetime | None = None,
    ) -> JournalEntryDetails:
        raise RuntimeError("Entry service not configured")


class TodayRepository:
    """Readonly accessors for Today checklist entries."""

    def __init__(self, entry_service: EntryService) -> None:
        self._entry_service = entry_service

    async def load_entries(
        self, *, user_id: str, limit: int, before: str | None
    ) -> list[TodayEntry]:
        """Return Today entries ordered by recency."""

        def _fetch() -> list[TodayEntry]:
            records = self._entry_service.list_entries(include_archived=False)
            filtered = [
                record for record in records if record.category == "today"
            ]
            if before:
                cutoff = _parse_iso_datetime(before)
                if cutoff is not None:
                    filtered = [
                        record
                        for record in filtered
                        if record.updated_at < cutoff
                    ]
            filtered.sort(key=lambda record: record.updated_at, reverse=True)
            return [_to_today_entry(record) for record in filtered[:limit]]

        return await anyio.to_thread.run_sync(_fetch)


@runtime_checkable
class BaseTodayRepository(Protocol):
    """Interface for Today repositories consumed by the agent."""

    async def load_entries(
        self, *, user_id: str, limit: int, before: str | None
    ) -> list[TodayEntry]:
        """Return Today entries ordered by recency."""


class EmptyTodayRepository:
    """Fallback repository returning no Today entries."""

    async def load_entries(
        self, *, user_id: str, limit: int, before: str | None
    ) -> list[TodayEntry]:
        return []


class EntryRepository:
    """Readonly accessors for Storyloop entries by ID."""

    def __init__(self, entry_service: EntryService) -> None:
        self._entry_service = entry_service

    async def get_entry(self, entry_id: str) -> EntryDetails:
        """Return a single entry by identifier."""

        def _fetch() -> EntryDetails:
            record = self._entry_service.get_entry(entry_id)
            if record is None:
                raise RuntimeError("Entry not found")
            return EntryDetails(
                id=record.id,
                title=record.title,
                summary=record.summary,
                occurred_at=record.occurred_at.isoformat(),
                category=record.category,
                link_url=record.link_url,
                thumbnail_url=record.thumbnail_url,
                video_id=record.video_id,
                pinned=record.pinned,
                tags=extract_tags_from_values(
                    record.title, record.summary, record.prompt_body
                ),
            )

        return await anyio.to_thread.run_sync(_fetch)


@runtime_checkable
class BaseEntryRepository(Protocol):
    """Interface for entry repositories consumed by the agent."""

    async def get_entry(self, entry_id: str) -> EntryDetails:
        """Return a single entry by identifier."""


class EmptyEntryRepository:
    """Fallback repository returning no entry data."""

    async def get_entry(self, entry_id: str) -> EntryDetails:
        raise RuntimeError("Entry service not configured")


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

    _DEFAULT_MAX_SCAN: int = 500
    _HARD_MAX_SCAN: int = 2000

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
        return await anyio.to_thread.run_sync(
            self._user_service.get_active_user
        )

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
            video
            for video in feed.videos
            if include_shorts or video.video_type == "video"
        ][:limit]
        return [
            VideoDetails(
                video_id=video.id,
                title=video.title,
                description=video.description,
                published_at=video.published_at.isoformat(),
                url=video.url,
                tags=getattr(
                    video,
                    "tags",
                    extract_tags_from_values(video.title, video.description),
                ),
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
            published_at=video.published_at.isoformat(),
            url=video.url,
            tags=getattr(
                video,
                "tags",
                extract_tags_from_values(video.title, video.description),
            ),
        )

    async def list_videos(
        self,
        *,
        limit: int = 50,
        include_shorts: bool = False,
        start_iso: str | None = None,
        end_iso: str | None = None,
        max_scan: int | None = None,
    ) -> list[VideoDetails]:
        """List videos for the active channel, optionally filtered by date range.

        This is designed for agent queries like "how many uploads last year?"
        or "show me titles from last month".

        Notes:
        - Results are bounded by `max_scan` to avoid expensive API usage.
        - Date filtering is applied after fetching (YouTube uploads are newest-first).
        """

        active_user = await self._get_active_user()
        channel_identifier = active_user.channel_id if active_user else None
        if channel_identifier is None:
            return []

        effective_max_scan = max_scan or self._DEFAULT_MAX_SCAN
        effective_max_scan = max(
            1, min(effective_max_scan, self._HARD_MAX_SCAN)
        )

        video_type = None if include_shorts else "video"
        feed = await self._youtube_service.fetch_channel_feed(
            channel_identifier,
            video_type=video_type,
            user_service=self._user_service,
            oauth_service=self._oauth_service,
            max_results=effective_max_scan,
        )

        start_dt = _parse_iso_datetime(start_iso)
        end_dt = _parse_iso_datetime(end_iso)

        filtered: list[VideoDetails] = []
        for video in feed.videos:
            if not include_shorts and video.video_type != "video":
                continue
            if start_dt and video.published_at < start_dt:
                continue
            if end_dt and video.published_at >= end_dt:
                continue
            filtered.append(
                VideoDetails(
                    video_id=video.id,
                    title=video.title,
                    description=video.description,
                    published_at=video.published_at.isoformat(),
                    url=video.url,
                    tags=getattr(
                        video,
                        "tags",
                        extract_tags_from_values(video.title, video.description),
                    ),
                )
            )
            if len(filtered) >= limit:
                break

        return filtered

    async def count_videos_published(
        self,
        *,
        start_iso: str | None = None,
        end_iso: str | None = None,
        include_shorts: bool = False,
        max_scan: int | None = None,
    ) -> VideoCountResult:
        """Count videos published in a date range for the active channel."""

        active_user = await self._get_active_user()
        channel_identifier = active_user.channel_id if active_user else None
        if channel_identifier is None:
            return VideoCountResult(
                start_iso=start_iso,
                end_iso=end_iso,
                count=0,
                scanned=0,
                truncated=False,
                note="No active channel configured.",
            )

        effective_max_scan = max_scan or self._DEFAULT_MAX_SCAN
        effective_max_scan = max(
            1, min(effective_max_scan, self._HARD_MAX_SCAN)
        )

        video_type = None if include_shorts else "video"
        feed = await self._youtube_service.fetch_channel_feed(
            channel_identifier,
            video_type=video_type,
            user_service=self._user_service,
            oauth_service=self._oauth_service,
            max_results=effective_max_scan,
        )

        start_dt = _parse_iso_datetime(start_iso)
        end_dt = _parse_iso_datetime(end_iso)

        count = 0
        for video in feed.videos:
            if not include_shorts and video.video_type != "video":
                continue
            if start_dt and video.published_at < start_dt:
                continue
            if end_dt and video.published_at >= end_dt:
                continue
            count += 1

        scanned = len(feed.videos)
        truncated = False
        note: str | None = None
        if scanned >= effective_max_scan:
            # If we hit the scan cap and the oldest scanned video might still be in-range,
            # we can't guarantee completeness.
            oldest = min((v.published_at for v in feed.videos), default=None)
            if oldest is None:
                truncated = False
            elif start_dt is None:
                truncated = True
            else:
                truncated = oldest >= start_dt
            if truncated:
                note = (
                    "Result may be incomplete: scan limit reached. "
                    "Increase max_scan to improve coverage."
                )

        return VideoCountResult(
            start_iso=start_iso,
            end_iso=end_iso,
            count=count,
            scanned=scanned,
            truncated=truncated,
            note=note,
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


@runtime_checkable
class BaseYouTubeRepository(Protocol):
    """Interface for YouTube repositories consumed by the agent."""

    async def list_recent_videos(
        self, *, limit: int = 5, include_shorts: bool = False
    ) -> list[VideoDetails]:
        """Return recent videos for the active channel."""

    async def get_video(self, video_id: str) -> VideoDetails:
        """Return detailed metadata for a single video."""

    async def list_videos(
        self,
        *,
        limit: int = 50,
        include_shorts: bool = False,
        start_iso: str | None = None,
        end_iso: str | None = None,
        max_scan: int | None = None,
    ) -> list[VideoDetails]:
        """List videos, optionally filtered by date range."""

    async def count_videos_published(
        self,
        *,
        start_iso: str | None = None,
        end_iso: str | None = None,
        include_shorts: bool = False,
        max_scan: int | None = None,
    ) -> VideoCountResult:
        """Count videos published in a date range."""

    async def get_video_metrics(self, video_id: str) -> VideoMetrics:
        """Return metrics for a specific video."""

    async def get_channel_metrics(self) -> ChannelMetrics:
        """Return metrics for the active channel."""

    async def get_video_analytics(self, video_id: str) -> VideoAnalyticsMetrics:
        """Return analytics metrics for a specific video."""


class EmptyYouTubeRepository:
    """Fallback repository returning empty YouTube data."""

    async def list_recent_videos(
        self, *, limit: int = 5, include_shorts: bool = False
    ) -> list[VideoDetails]:
        return []

    async def get_video(self, video_id: str) -> VideoDetails:
        raise RuntimeError("YouTube service not configured")

    async def list_videos(
        self,
        *,
        limit: int = 50,
        include_shorts: bool = False,
        start_iso: str | None = None,
        end_iso: str | None = None,
        max_scan: int | None = None,
    ) -> list[VideoDetails]:
        return []

    async def count_videos_published(
        self,
        *,
        start_iso: str | None = None,
        end_iso: str | None = None,
        include_shorts: bool = False,
        max_scan: int | None = None,
    ) -> VideoCountResult:
        return VideoCountResult(
            start_iso=start_iso,
            end_iso=end_iso,
            count=0,
            scanned=0,
            truncated=False,
            note="YouTube service not configured.",
        )

    async def get_video_metrics(self, video_id: str) -> VideoMetrics:
        raise RuntimeError("YouTube service not configured")

    async def get_channel_metrics(self) -> ChannelMetrics:
        raise RuntimeError("YouTube service not configured")

    async def get_video_analytics(self, video_id: str) -> VideoAnalyticsMetrics:
        raise RuntimeError("YouTube service not configured")


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        # Assume UTC if tz is missing.
        from datetime import UTC

        return parsed.replace(tzinfo=UTC)
    return parsed
