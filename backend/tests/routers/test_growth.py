"""Integration tests for the growth score endpoint."""

from __future__ import annotations

from datetime import datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app


@pytest.mark.asyncio
async def test_growth_score_endpoint_returns_valid_response() -> None:
    """Test that the growth score endpoint returns a valid response structure."""
    settings = Settings(
        DATABASE_URL="sqlite:///:memory:",
        YOUTUBE_DEMO_MODE=True,  # Use demo mode to ensure all services are available
    )
    app = create_app(settings)

    # Use lifespan to properly initialize app state
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.get("/growth/score")

        assert response.status_code == 200

        payload = response.json()

        # Verify response structure
        assert "totalScore" in payload
        assert "scoreDelta" in payload
        assert "isEarlyChannel" in payload
        assert "updatedAt" in payload
        assert "breakdown" in payload

        # Verify score is a valid number in range
        assert isinstance(payload["totalScore"], (int, float))
        assert 0 <= payload["totalScore"] <= 100

        # Verify timestamp is valid
        updated_at = datetime.fromisoformat(payload["updatedAt"].replace("Z", "+00:00"))
        assert updated_at.tzinfo is not None

        # Verify breakdown structure
        breakdown = payload["breakdown"]
        for component in ["discovery", "retention", "loyalty"]:
            assert component in breakdown
            assert "rawValue" in breakdown[component]
            assert "score" in breakdown[component]
            assert "weight" in breakdown[component]
            assert 0 <= breakdown[component]["score"] <= 100
            assert 0 <= breakdown[component]["weight"] <= 1
