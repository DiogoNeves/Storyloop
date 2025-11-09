"""Growth score service providing Storyloop Growth Index calculations."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Sequence

from app.services.sgi import (
    ScoreComputation,
    VideoScoreInputs,
    compute_growth_score,
)

logger = logging.getLogger(__name__)


@dataclass
class GrowthScoreService:
    """Service responsible for Storyloop growth score calculations."""

    def recalculate_growth_score(self) -> None:
        """Log a placeholder recalculation until real metrics are wired in."""
        logger.info("Pretending to recalculate growth score aggregates.")

    def load_latest_score(self, channel_id: str | None = None) -> ScoreComputation:
        """Calculate the latest Storyloop Growth Index for the given channel."""

        current_video, baseline_videos = self._load_sample_dataset(channel_id)
        return compute_growth_score(current_video, baseline_videos)

    def _load_sample_dataset(
        self, channel_id: str | None
    ) -> tuple[VideoScoreInputs, Sequence[VideoScoreInputs]]:
        """Return a deterministic dataset while API integrations are in progress."""

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

        # channel_id currently unused; the dataset stands in until persistence arrives
        return current, baseline


__all__ = ["GrowthScoreService"]
