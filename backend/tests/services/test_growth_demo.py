from __future__ import annotations

from app.db import create_connection_factory
from app.services.growth import GrowthScoreService
from app.services.growth_demo import seed_demo_growth_metrics


def test_seed_demo_growth_metrics_populates_offline_data() -> None:
    service = GrowthScoreService(create_connection_factory("sqlite:///:memory:"))

    seed_demo_growth_metrics(service)

    results = service.recalculate_growth_score()

    assert results, "Demo metrics should allow offline growth score calculation"
