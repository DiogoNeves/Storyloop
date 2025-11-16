"""Demo fixtures for growth score calculations.

This module seeds the growth score service with offline metrics so the demo
experience remains self-contained without external YouTube requests.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.services.growth import GrowthScoreService, VideoMetricsRecord


def seed_demo_growth_metrics(service: GrowthScoreService) -> tuple[str, str]:
    """Populate the growth score tables with canned demo data.

    Returns:
        The primary (channel_id, video_type) pair represented in the demo data.
    """

    base_date = datetime(2024, 1, 1, tzinfo=UTC)
    channel_id = "storyloop-channel"
    video_type = "video"

    records = [
        VideoMetricsRecord(
            video_id="storyloop-001",
            channel_id=channel_id,
            video_type=video_type,
            published_at=base_date + timedelta(days=1),
            view_velocity_7d=43_200,
            average_view_percentage=0.58,
            early_hook_score=74.0,
            subscribers_gained=480,
            subscribers_lost=110,
            views_28d=60_000,
        ),
        VideoMetricsRecord(
            video_id="storyloop-002",
            channel_id=channel_id,
            video_type=video_type,
            published_at=base_date + timedelta(days=2),
            view_velocity_7d=39_800,
            average_view_percentage=0.56,
            early_hook_score=71.0,
            subscribers_gained=410,
            subscribers_lost=95,
            views_28d=57_000,
        ),
        VideoMetricsRecord(
            video_id="storyloop-003",
            channel_id=channel_id,
            video_type=video_type,
            published_at=base_date + timedelta(days=3),
            view_velocity_7d=51_500,
            average_view_percentage=0.60,
            early_hook_score=80.0,
            subscribers_gained=520,
            subscribers_lost=130,
            views_28d=68_000,
        ),
        VideoMetricsRecord(
            video_id="storyloop-004",
            channel_id=channel_id,
            video_type=video_type,
            published_at=base_date + timedelta(days=4),
            view_velocity_7d=47_000,
            average_view_percentage=0.59,
            early_hook_score=76.0,
            subscribers_gained=455,
            subscribers_lost=115,
            views_28d=59_000,
        ),
        VideoMetricsRecord(
            video_id="storyloop-005",
            channel_id=channel_id,
            video_type=video_type,
            published_at=base_date + timedelta(days=5),
            view_velocity_7d=44_500,
            average_view_percentage=0.57,
            early_hook_score=73.0,
            subscribers_gained=430,
            subscribers_lost=110,
            views_28d=55_000,
        ),
        VideoMetricsRecord(
            video_id="storyloop-006",
            channel_id=channel_id,
            video_type=video_type,
            published_at=base_date + timedelta(days=6),
            view_velocity_7d=52_000,
            average_view_percentage=0.62,
            early_hook_score=79.0,
            subscribers_gained=520,
            subscribers_lost=110,
            views_28d=70_000,
        ),
        VideoMetricsRecord(
            video_id="storyloop-007",
            channel_id=channel_id,
            video_type=video_type,
            published_at=base_date + timedelta(days=7),
            view_velocity_7d=48_250,
            average_view_percentage=0.61,
            early_hook_score=78.0,
            subscribers_gained=540,
            subscribers_lost=120,
            views_28d=64_000,
        ),
        VideoMetricsRecord(
            video_id="storyloop-short-01",
            channel_id=channel_id,
            video_type="short",
            published_at=base_date + timedelta(days=8),
            view_velocity_7d=35_000,
            average_view_percentage=0.63,
            early_hook_score=82.0,
            subscribers_gained=380,
            subscribers_lost=90,
            views_28d=45_000,
        ),
        VideoMetricsRecord(
            video_id="storyloop-other-channel-01",
            channel_id="alternate-channel",
            video_type=video_type,
            published_at=base_date + timedelta(days=9),
            view_velocity_7d=41_000,
            average_view_percentage=0.55,
            early_hook_score=70.0,
            subscribers_gained=300,
            subscribers_lost=80,
            views_28d=52_000,
        ),
    ]

    service.upsert_video_metrics(records)
    return channel_id, video_type


__all__ = ["seed_demo_growth_metrics"]
