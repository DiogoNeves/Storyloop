from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import pytest

from app.services.agent_tools.repositories import YouTubeRepository


@dataclass(frozen=True)
class _Video:
    id: str
    title: str
    description: str
    url: str
    published_at: datetime
    video_type: str = "video"


@dataclass(frozen=True)
class _Feed:
    videos: list[_Video]


class _YoutubeService:
    def __init__(self, feed: _Feed) -> None:
        self._feed = feed
        self.calls: list[dict] = []

    async def fetch_channel_feed(self, channel: str, **kwargs):
        self.calls.append({"channel": channel, **kwargs})
        return self._feed

    async def fetch_video_detail(self, *_args, **_kwargs):  # pragma: no cover
        raise NotImplementedError


class _User:
    def __init__(self, channel_id: str) -> None:
        self.channel_id = channel_id


class _UserService:
    def __init__(self, channel_id: str) -> None:
        self._user = _User(channel_id)

    def get_active_user(self):
        return self._user


@pytest.mark.asyncio
async def test_list_videos_filters_by_date_range_and_limit():
    feed = _Feed(
        videos=[
            _Video(
                id="v3",
                title="Mar",
                description="",
                url="https://youtube.com/watch?v=v3",
                published_at=datetime(2024, 3, 1, tzinfo=UTC),
            ),
            _Video(
                id="v2",
                title="Feb",
                description="",
                url="https://youtube.com/watch?v=v2",
                published_at=datetime(2024, 2, 1, tzinfo=UTC),
            ),
            _Video(
                id="v1",
                title="Jan",
                description="",
                url="https://youtube.com/watch?v=v1",
                published_at=datetime(2024, 1, 1, tzinfo=UTC),
            ),
        ]
    )
    repo = YouTubeRepository(
        _YoutubeService(feed),
        _UserService("UC-123"),
        oauth_service=None,
        analytics_service=None,
    )

    results = await repo.list_videos(
        limit=1,
        start_iso="2024-02-01T00:00:00Z",
        end_iso="2024-04-01T00:00:00Z",
    )

    assert [v.video_id for v in results] == ["v3"]
    assert results[0].published_at.startswith("2024-03-01")


@pytest.mark.asyncio
async def test_count_videos_published_marks_truncated_when_scan_limit_reached_and_may_include_more():
    feed = _Feed(
        videos=[
            _Video(
                id="v2",
                title="Newer",
                description="",
                url="https://youtube.com/watch?v=v2",
                published_at=datetime(2024, 2, 1, tzinfo=UTC),
            ),
            _Video(
                id="v1",
                title="Older",
                description="",
                url="https://youtube.com/watch?v=v1",
                published_at=datetime(2024, 1, 1, tzinfo=UTC),
            ),
        ]
    )
    repo = YouTubeRepository(
        _YoutubeService(feed),
        _UserService("UC-123"),
        oauth_service=None,
        analytics_service=None,
    )

    result = await repo.count_videos_published(
        start_iso="2020-01-01T00:00:00Z",
        end_iso="2030-01-01T00:00:00Z",
        max_scan=2,
    )

    assert result.count == 2
    assert result.scanned == 2
    assert result.truncated is True
    assert result.note


@pytest.mark.asyncio
async def test_count_videos_published_not_truncated_when_oldest_scanned_is_before_start():
    feed = _Feed(
        videos=[
            _Video(
                id="v2",
                title="Newer",
                description="",
                url="https://youtube.com/watch?v=v2",
                published_at=datetime(2024, 2, 1, tzinfo=UTC),
            ),
            _Video(
                id="v1",
                title="Older",
                description="",
                url="https://youtube.com/watch?v=v1",
                published_at=datetime(2024, 1, 1, tzinfo=UTC),
            ),
        ]
    )
    repo = YouTubeRepository(
        _YoutubeService(feed),
        _UserService("UC-123"),
        oauth_service=None,
        analytics_service=None,
    )

    result = await repo.count_videos_published(
        start_iso="2024-02-01T00:00:00Z",
        end_iso="2030-01-01T00:00:00Z",
        max_scan=2,
    )

    assert result.count == 1
    assert result.scanned == 2
    assert result.truncated is False
