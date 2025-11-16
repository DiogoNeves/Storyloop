"""Growth score service providing Storyloop Growth Index calculations."""

from __future__ import annotations

import logging
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime
from sqlite3 import Row
from typing import Iterable

from app.services.sgi import (
    ScoreComputation,
    VideoScoreInputs,
    compute_growth_score,
)
from app.db import SqliteConnectionFactory, create_connection_factory

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class VideoMetricsRecord:
    """Persisted metrics for a single YouTube video."""

    video_id: str
    channel_id: str
    video_type: str
    published_at: datetime
    view_velocity_7d: float | None
    average_view_percentage: float | None
    early_hook_score: float | None
    subscribers_gained: int | None
    subscribers_lost: int | None
    views_28d: int | None


@dataclass(slots=True)
class GrowthScoreService:
    """Service responsible for Storyloop growth score calculations."""

    connection_factory: SqliteConnectionFactory | None = None

    def __post_init__(self) -> None:
        if self.connection_factory is None:
            self.connection_factory = create_connection_factory()
        self.ensure_schema()

    def ensure_schema(self) -> None:
        """Create tables required for growth score calculations."""

        with closing(self.connection_factory()) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS video_metrics (
                    video_id TEXT PRIMARY KEY,
                    channel_id TEXT NOT NULL,
                    video_type TEXT NOT NULL,
                    published_at TEXT NOT NULL,
                    view_velocity_7d REAL,
                    average_view_percentage REAL,
                    early_hook_score REAL,
                    subscribers_gained INTEGER,
                    subscribers_lost INTEGER,
                    views_28d INTEGER
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS growth_scores (
                    channel_id TEXT NOT NULL,
                    video_type TEXT NOT NULL,
                    total_score REAL NOT NULL,
                    score_delta REAL NOT NULL,
                    updated_at TEXT NOT NULL,
                    is_early_channel INTEGER NOT NULL,
                    discovery_raw REAL,
                    discovery_score REAL NOT NULL,
                    discovery_weight REAL NOT NULL,
                    retention_raw REAL,
                    retention_score REAL NOT NULL,
                    retention_weight REAL NOT NULL,
                    loyalty_raw REAL,
                    loyalty_score REAL NOT NULL,
                    loyalty_weight REAL NOT NULL,
                    PRIMARY KEY (channel_id, video_type)
                )
                """
            )
            connection.commit()

    def recalculate_growth_score(self) -> list[ScoreComputation]:
        """Recompute and persist growth scores for all known channels."""

        channel_filters = self._list_channel_filters()
        results: list[ScoreComputation] = []
        for channel_id, video_type in channel_filters:
            try:
                computation = self.load_latest_score(channel_id, video_type)
            except ValueError as exc:
                logger.warning("Skipping growth score recalculation for %s: %s", channel_id, exc)
                continue
            results.append(computation)
        return results

    def load_latest_score(
        self, channel_id: str | None = None, video_type: str | None = None
    ) -> ScoreComputation:
        """Calculate the latest Storyloop Growth Index for the given channel.

        Args:
            channel_id: Optional channel identifier.
            video_type: Optional filter by video type ("short", "live", or "video").
        """
        records = self._fetch_video_metrics(channel_id, video_type)
        if not records:
            raise ValueError("No video metrics are available for growth score calculation.")

        current_row, *baseline_rows = records
        current_video = self._row_to_inputs(current_row)
        baseline_videos = [self._row_to_inputs(row) for row in baseline_rows]

        computation = compute_growth_score(current_video, baseline_videos)
        self._persist_growth_score(
            channel_id or current_row["channel_id"], video_type, computation
        )
        return computation

    def upsert_video_metrics(self, records: Iterable[VideoMetricsRecord]) -> None:
        """Persist or update metrics for the provided videos."""

        to_insert = list(records)
        if not to_insert:
            return

        with closing(self.connection_factory()) as connection:
            for record in to_insert:
                connection.execute(
                    """
                    INSERT INTO video_metrics (
                        video_id,
                        channel_id,
                        video_type,
                        published_at,
                        view_velocity_7d,
                        average_view_percentage,
                        early_hook_score,
                        subscribers_gained,
                        subscribers_lost,
                        views_28d
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(video_id) DO UPDATE SET
                        channel_id = excluded.channel_id,
                        video_type = excluded.video_type,
                        published_at = excluded.published_at,
                        view_velocity_7d = excluded.view_velocity_7d,
                        average_view_percentage = excluded.average_view_percentage,
                        early_hook_score = excluded.early_hook_score,
                        subscribers_gained = excluded.subscribers_gained,
                        subscribers_lost = excluded.subscribers_lost,
                        views_28d = excluded.views_28d
                    """,
                    (
                        record.video_id,
                        record.channel_id,
                        record.video_type,
                        record.published_at.isoformat(),
                        record.view_velocity_7d,
                        record.average_view_percentage,
                        record.early_hook_score,
                        record.subscribers_gained,
                        record.subscribers_lost,
                        record.views_28d,
                    ),
                )
            connection.commit()

    def _fetch_video_metrics(
        self, channel_id: str | None, video_type: str | None
    ) -> list[Row]:
        """Return ordered video metrics applying channel and type filters."""

        with closing(self.connection_factory()) as connection:
            rows = connection.execute(
                """
                SELECT
                    video_id,
                    channel_id,
                    video_type,
                    published_at,
                    view_velocity_7d,
                    average_view_percentage,
                    early_hook_score,
                    subscribers_gained,
                    subscribers_lost,
                    views_28d
                FROM video_metrics
                WHERE (? IS NULL OR channel_id = ?)
                  AND (? IS NULL OR video_type = ?)
                ORDER BY datetime(published_at) DESC
                """,
                (channel_id, channel_id, video_type, video_type),
            ).fetchall()
        return list(rows)

    def _persist_growth_score(
        self,
        channel_id: str,
        video_type: str | None,
        computation: ScoreComputation,
    ) -> None:
        """Save computed growth score aggregates for later retrieval."""

        breakdown = computation.breakdown
        stored_video_type = self._normalize_video_type(video_type)
        with closing(self.connection_factory()) as connection:
            connection.execute(
                """
                INSERT INTO growth_scores (
                    channel_id,
                    video_type,
                    total_score,
                    score_delta,
                    updated_at,
                    is_early_channel,
                    discovery_raw,
                    discovery_score,
                    discovery_weight,
                    retention_raw,
                    retention_score,
                    retention_weight,
                    loyalty_raw,
                    loyalty_score,
                    loyalty_weight
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(channel_id, video_type) DO UPDATE SET
                    total_score = excluded.total_score,
                    score_delta = excluded.score_delta,
                    updated_at = excluded.updated_at,
                    is_early_channel = excluded.is_early_channel,
                    discovery_raw = excluded.discovery_raw,
                    discovery_score = excluded.discovery_score,
                    discovery_weight = excluded.discovery_weight,
                    retention_raw = excluded.retention_raw,
                    retention_score = excluded.retention_score,
                    retention_weight = excluded.retention_weight,
                    loyalty_raw = excluded.loyalty_raw,
                    loyalty_score = excluded.loyalty_score,
                    loyalty_weight = excluded.loyalty_weight
                """,
                (
                    channel_id,
                    stored_video_type,
                    computation.total_score,
                    computation.score_delta,
                    computation.updated_at.isoformat(),
                    int(computation.is_early_channel),
                    breakdown.discovery.raw_value,
                    breakdown.discovery.score,
                    breakdown.discovery.weight,
                    breakdown.retention.raw_value,
                    breakdown.retention.score,
                    breakdown.retention.weight,
                    breakdown.loyalty.raw_value,
                    breakdown.loyalty.score,
                    breakdown.loyalty.weight,
                ),
            )
            connection.commit()

    def _row_to_inputs(self, row: Row) -> VideoScoreInputs:
        return VideoScoreInputs(
            video_id=row["video_id"],
            view_velocity_7d=row["view_velocity_7d"],
            average_view_percentage=row["average_view_percentage"],
            early_hook_score=row["early_hook_score"],
            subscribers_gained=row["subscribers_gained"],
            subscribers_lost=row["subscribers_lost"],
            views_28d=row["views_28d"],
        )

    def _list_channel_filters(self) -> list[tuple[str, str | None]]:
        """Return unique channel and video type combinations with stored metrics."""

        with closing(self.connection_factory()) as connection:
            rows = connection.execute(
                """
                SELECT DISTINCT channel_id, video_type
                FROM video_metrics
                """
            ).fetchall()
        return [(row["channel_id"], row["video_type"]) for row in rows]

    @staticmethod
    def _normalize_video_type(video_type: str | None) -> str:
        return video_type or "all"


__all__ = ["GrowthScoreService", "VideoMetricsRecord"]
