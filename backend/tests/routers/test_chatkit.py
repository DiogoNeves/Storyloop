"""Tests for ChatKit endpoints."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app
from app.services.chatkit import ChatKitConfigurationError, ChatKitService
from app.services.users import UserService


class FakeChatKitService:
    """Fake ChatKit service for testing."""

    def __init__(self) -> None:
        self.created_sessions: list[dict[str, str]] = []
        self.should_fail = False

    def create_session(
        self, user_id: str, metadata: dict[str, str] | None = None
    ) -> dict[str, str]:
        """Create a fake session."""
        if self.should_fail:
            raise ChatKitConfigurationError("Test error")
        session_data = {
            "client_secret": f"secret-{user_id}",
            "session_id": f"session-{user_id}",
        }
        self.created_sessions.append(session_data)
        return session_data


def create_test_app() -> tuple[Any, FakeChatKitService]:
    """Create a test app with fake ChatKit service."""
    settings = Settings(
        DATABASE_URL="sqlite:///:memory:",
        OPENAI_API_KEY="test-openai-key",
        CORS_ORIGINS="http://frontend.test",
    )
    app = create_app(settings)
    fake_chatkit = FakeChatKitService()
    app.state.chatkit_service = fake_chatkit

    return app, fake_chatkit


@pytest.mark.asyncio
async def test_create_session_returns_client_secret() -> None:
    """Test that session creation returns a client secret."""
    app, fake_chatkit = create_test_app()

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            # Ensure a user exists
            user_service: UserService = app.state.user_service
            user_service.upsert_credentials("{}", None)

            response = await client.post("/chatkit/session")

    assert response.status_code == 200
    payload = response.json()
    assert "client_secret" in payload
    assert payload["client_secret"].startswith("secret-")
    assert len(fake_chatkit.created_sessions) == 1


@pytest.mark.asyncio
async def test_create_session_requires_user() -> None:
    """Test that session creation fails without an active user."""
    app, _ = create_test_app()

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            response = await client.post("/chatkit/session")

    assert response.status_code == 401
    payload = response.json()
    assert "detail" in payload
    assert "not found" in payload["detail"].lower()


@pytest.mark.asyncio
async def test_create_session_handles_service_error() -> None:
    """Test that session creation handles service errors gracefully."""
    app, fake_chatkit = create_test_app()
    fake_chatkit.should_fail = True

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            user_service: UserService = app.state.user_service
            user_service.upsert_credentials("{}", None)

            response = await client.post("/chatkit/session")

    assert response.status_code == 500
    payload = response.json()
    assert "detail" in payload


@pytest.mark.asyncio
async def test_youtube_get_metrics_returns_mock_data() -> None:
    """Test that the YouTube metrics tool returns mock data."""
    app, _ = create_test_app()

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            user_service: UserService = app.state.user_service
            user_service.upsert_credentials("{}", None)

            response = await client.post(
                "/chatkit/tools/youtube_get_metrics",
                json={"video_ids": ["video1", "video2"]},
            )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert "data" in payload
    assert "videos" in payload["data"]
    assert len(payload["data"]["videos"]) == 2
    assert payload["data"]["videos"][0]["video_id"] == "video1"


@pytest.mark.asyncio
async def test_youtube_get_metrics_requires_user() -> None:
    """Test that the YouTube metrics tool requires authentication."""
    app, _ = create_test_app()

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            response = await client.post(
                "/chatkit/tools/youtube_get_metrics",
                json={"video_ids": ["video1"]},
            )

    assert response.status_code == 401
    payload = response.json()
    assert "detail" in payload
    assert "not found" in payload["detail"].lower()

