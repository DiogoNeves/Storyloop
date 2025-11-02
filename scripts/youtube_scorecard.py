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
import sys
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from statistics import fmean
from typing import Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_PATH = PROJECT_ROOT / "backend"
if str(BACKEND_PATH) not in sys.path:
    sys.path.insert(0, str(BACKEND_PATH))

from app.services.youtube import (  # noqa: E402
    YoutubeAPIRequestError,
    YoutubeChannelNotFound,
    YoutubeConfigurationError,
    YoutubeFeed,
    YoutubeService,
    YoutubeVideoStatistics,
)


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
