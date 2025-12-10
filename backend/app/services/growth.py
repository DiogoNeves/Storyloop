"""Growth score service providing Storyloop Growth Index calculations."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.services.sgi import (
    ScoreComputation,
    VideoScoreInputs,
    compute_growth_score,
)

if TYPE_CHECKING:
    from app.services.users import UserService
    from app.services.youtube import YoutubeService, YoutubeVideo
    from app.services.youtube_analytics import VideoAnalytics, YoutubeAnalyticsService
    from app.services.youtube_oauth import YoutubeOAuthService

logger = logging.getLogger(__name__)

DEFAULT_BASELINE_SIZE = 10


@dataclass
class GrowthScoreService:
    """Service responsible for Storyloop growth score calculations."""

    def recalculate_growth_score(self) -> None:
        """Log a placeholder recalculation until real metrics are wired in."""
        logger.info("Pretending to recalculate growth score aggregates.")

    async def load_latest_score(
        self,
        channel_id: str | None,
        video_type: str | None,
        youtube_service: YoutubeService,
        analytics_service: YoutubeAnalyticsService,
        user_service: UserService,
        oauth_service: YoutubeOAuthService | None,
    ) -> ScoreComputation:
        """Calculate the latest Storyloop Growth Index for the given channel.

        Fetches recent videos and their analytics from YouTube APIs, then computes
        the SGI using the latest video as "current" and previous videos as baseline.

        Args:
            channel_id: Optional channel identifier. If None, uses active user's channel.
            video_type: Optional filter by video type ("short", "live", or "video").
            youtube_service: Service for fetching video data.
            analytics_service: Service for fetching analytics data.
            user_service: Service for user/channel info.
            oauth_service: OAuth service for authenticated requests.
        """
        videos = await self._fetch_recent_videos(
            channel_id,
            video_type,
            youtube_service,
            user_service,
            oauth_service,
        )

        if not videos:
            logger.info("No videos found, returning sample score")
            return self._compute_sample_score()

        analytics = await analytics_service.fetch_videos_analytics(
            [(v.id, v.published_at) for v in videos]
        )

        inputs = self._build_score_inputs(videos, analytics)
        if not inputs:
            logger.info("No valid inputs, returning sample score")
            return self._compute_sample_score()

        current = inputs[0]
        baseline = inputs[1:] if len(inputs) > 1 else []

        return compute_growth_score(current, baseline)

    async def _fetch_recent_videos(
        self,
        channel_id: str | None,
        video_type: str | None,
        youtube_service: YoutubeService,
        user_service: UserService,
        oauth_service: YoutubeOAuthService | None,
    ) -> list[YoutubeVideo]:
        """Fetch recent videos for score calculation."""
        import anyio

        # Get channel identifier
        identifier = channel_id
        if identifier is None:
            user = await anyio.to_thread.run_sync(user_service.get_active_user)
            identifier = user.channel_id if user else None

        if not identifier:
            return []

        try:
            feed = await youtube_service.fetch_channel_feed(
                identifier,
                video_type=video_type,
                user_service=user_service,
                oauth_service=oauth_service,
                max_results=DEFAULT_BASELINE_SIZE + 1,
            )
            return feed.videos
        except Exception as e:
            logger.warning(f"Failed to fetch videos: {e}")
            return []

    def _build_score_inputs(
        self,
        videos: list[YoutubeVideo],
        analytics: dict[str, VideoAnalytics],
    ) -> list[VideoScoreInputs]:
        """Build VideoScoreInputs from video data and analytics."""
        inputs: list[VideoScoreInputs] = []

        for video in videos:
            video_analytics = analytics.get(video.id)

            # Get view velocity from analytics, fall back to current views from Data API
            views_7d = None
            views_28d = None
            avp = None
            subs_gained = None
            subs_lost = None

            if video_analytics:
                views_7d = video_analytics.views_7d
                views_28d = video_analytics.views_28d
                # Convert from percentage (0-100) to decimal (0-1) for SGI
                if video_analytics.average_view_percentage is not None:
                    avp = video_analytics.average_view_percentage / 100.0
                subs_gained = video_analytics.subscribers_gained
                subs_lost = video_analytics.subscribers_lost

            # Fallback: use current view count as approximate VV7 if no analytics
            if views_7d is None and video.statistics:
                views_7d = video.statistics.view_count

            inputs.append(
                VideoScoreInputs(
                    video_id=video.id,
                    view_velocity_7d=float(views_7d) if views_7d else None,
                    average_view_percentage=avp,
                    early_hook_score=None,  # Not available in public API
                    subscribers_gained=subs_gained,
                    subscribers_lost=subs_lost,
                    views_28d=views_28d,
                )
            )

        return inputs

    def _compute_sample_score(self) -> ScoreComputation:
        """Return a sample score when real data is unavailable."""
        current, baseline = self._load_sample_dataset()
        return compute_growth_score(current, baseline)

    def _load_sample_dataset(
        self,
    ) -> tuple[VideoScoreInputs, list[VideoScoreInputs]]:
        """Return a deterministic dataset for demo/fallback purposes."""
        baseline: list[VideoScoreInputs] = [
            VideoScoreInputs(
                video_id="storyloop-001",
                view_velocity_7d=43_200,
                average_view_percentage=0.58,
                early_hook_score=74.0,
                subscribers_gained=480,
                subscribers_lost=110,
                views_28d=60_000,
            ),
            VideoScoreInputs(
                video_id="storyloop-002",
                view_velocity_7d=39_800,
                average_view_percentage=0.56,
                early_hook_score=71.0,
                subscribers_gained=410,
                subscribers_lost=95,
                views_28d=57_000,
            ),
            VideoScoreInputs(
                video_id="storyloop-003",
                view_velocity_7d=51_500,
                average_view_percentage=0.60,
                early_hook_score=80.0,
                subscribers_gained=520,
                subscribers_lost=130,
                views_28d=68_000,
            ),
            VideoScoreInputs(
                video_id="storyloop-004",
                view_velocity_7d=47_000,
                average_view_percentage=0.59,
                early_hook_score=76.0,
                subscribers_gained=455,
                subscribers_lost=115,
                views_28d=59_000,
            ),
            VideoScoreInputs(
                video_id="storyloop-005",
                view_velocity_7d=44_500,
                average_view_percentage=0.57,
                early_hook_score=73.0,
                subscribers_gained=430,
                subscribers_lost=110,
                views_28d=55_000,
            ),
            VideoScoreInputs(
                video_id="storyloop-006",
                view_velocity_7d=52_000,
                average_view_percentage=0.62,
                early_hook_score=79.0,
                subscribers_gained=520,
                subscribers_lost=110,
                views_28d=70_000,
            ),
        ]

        current = VideoScoreInputs(
            video_id="storyloop-007",
            view_velocity_7d=48_250,
            average_view_percentage=0.61,
            early_hook_score=78.0,
            subscribers_gained=540,
            subscribers_lost=120,
            views_28d=64_000,
        )

        return current, baseline


__all__ = ["GrowthScoreService"]
