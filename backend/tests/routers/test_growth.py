"""Integration tests for the growth score endpoint."""

from __future__ import annotations

from datetime import datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app


@pytest.mark.asyncio
async def test_growth_score_endpoint_returns_expected_payload() -> None:
    settings = Settings(
        database_url="sqlite:///:memory:", youtube_api_key="test-key"
    )
    app = create_app(settings)
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/growth/score")

    assert response.status_code == 200

    payload = response.json()
    assert payload["totalScore"] == pytest.approx(68.3)
    assert payload["scoreDelta"] == pytest.approx(18.3)
    assert payload["isEarlyChannel"] is False

    updated_at = datetime.fromisoformat(payload["updatedAt"].replace("Z", "+00:00"))
    assert updated_at.tzinfo is not None

    breakdown = payload["breakdown"]
    assert breakdown["discovery"] == {
        "rawValue": 48_250,
        "score": pytest.approx(56.7),
        "weight": pytest.approx(0.4),
    }
    assert breakdown["retention"]["rawValue"] == pytest.approx(67.8)
    assert breakdown["retention"]["score"] == pytest.approx(68.1)
    assert breakdown["retention"]["weight"] == pytest.approx(0.45)

    assert breakdown["loyalty"]["rawValue"] == pytest.approx(6.56)
    assert breakdown["loyalty"]["score"] == pytest.approx(100.0)
    assert breakdown["loyalty"]["weight"] == pytest.approx(0.15)
