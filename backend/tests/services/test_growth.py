"""Tests for the GrowthScoreService calculations."""

from __future__ import annotations

from contextlib import closing

import pytest

from app.db import create_connection_factory
from app.services.growth import GrowthScoreService
from tests.utils.growth import seed_video_metrics


def _build_service() -> GrowthScoreService:
    factory = create_connection_factory("sqlite:///:memory:")
    return GrowthScoreService(factory)


def test_load_latest_score_returns_expected_breakdown() -> None:
    service = _build_service()
    channel_id, video_type = seed_video_metrics(service)

    result = service.load_latest_score(channel_id=channel_id, video_type=video_type)

    assert result.total_score == pytest.approx(68.3)
    assert result.score_delta == pytest.approx(18.3)
    assert result.is_early_channel is False

    discovery = result.breakdown.discovery
    retention = result.breakdown.retention
    loyalty = result.breakdown.loyalty

    assert discovery.raw_value == 48_250
    assert discovery.score == pytest.approx(56.7)

    assert retention.raw_value == pytest.approx(67.8)
    assert retention.score == pytest.approx(68.1)

    assert loyalty.raw_value == pytest.approx(6.56)
    assert loyalty.score == pytest.approx(100.0)


def test_recalculate_growth_score_persists_results() -> None:
    service = _build_service()
    channel_id, video_type = seed_video_metrics(service)

    results = service.recalculate_growth_score()

    assert any(result.total_score == pytest.approx(68.3) for result in results)

    with closing(service.connection_factory()) as connection:
        row = connection.execute(
            """
            SELECT total_score, score_delta
            FROM growth_scores
            WHERE channel_id = ? AND video_type = ?
            """,
            (channel_id, video_type),
        ).fetchone()

    assert row is not None
    assert row["total_score"] == pytest.approx(68.3)
    assert row["score_delta"] == pytest.approx(18.3)
