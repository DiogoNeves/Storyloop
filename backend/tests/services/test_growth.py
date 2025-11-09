"""Tests for the GrowthScoreService calculations."""

from __future__ import annotations

import pytest

from app.services.growth import GrowthScoreService


def test_load_latest_score_returns_expected_breakdown() -> None:
    service = GrowthScoreService()

    result = service.load_latest_score()

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
