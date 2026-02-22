from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app


@pytest.mark.asyncio
async def test_channel_endpoints_are_removed() -> None:
    settings = Settings.model_validate(
        {"DATABASE_URL": "sqlite:///:memory:", "YOUTUBE_API_KEY": "test-key"}
    )
    app = create_app(settings)
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            get_profile = await client.get("/channel/")
            get_advice = await client.get("/channel/advice")
            put_profile = await client.put(
                "/channel/",
                json={"audienceFocus": "Legacy payload", "audienceBuckets": []},
            )

    assert get_profile.status_code == 404
    assert get_advice.status_code == 404
    assert put_profile.status_code == 404
