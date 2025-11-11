"""Tests for the ChatKit API endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.dependencies import get_chatkit_service, get_user_service
from app.main import create_app


class _StubChatKitService:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def create_session(self, *, user_id: str, enable_file_uploads: bool | None):
        self.calls.append({
            "user_id": user_id,
            "enable_file_uploads": enable_file_uploads,
        })
        return SimpleNamespace(
            id="cksess_test",
            client_secret="secret",
            expires_at=int(datetime(2025, 1, 1, tzinfo=UTC).timestamp()),
        )

    @property
    def workflow_id(self) -> str:
        return "wf_demo"


@pytest.mark.asyncio
async def test_create_session_returns_client_secret() -> None:
    settings = Settings(
        database_url="sqlite:///:memory:",
        openai_api_key="test",
        chatkit_workflow_id="wf_demo",
    )
    app = create_app(settings)
    stub = _StubChatKitService()

    class _StubUserService:
        def get_active_user(self):  # type: ignore[no-untyped-def]
            return SimpleNamespace(id="active")

    app.dependency_overrides[get_chatkit_service] = lambda: stub
    app.dependency_overrides[get_user_service] = lambda: _StubUserService()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/chatkit/session")

    assert response.status_code == 200
    payload = response.json()
    assert payload["clientSecret"] == "secret"
    assert payload["sessionId"] == "cksess_test"
    assert "expiresAt" in payload
    assert stub.calls == [
        {
            "user_id": "active",
            "enable_file_uploads": None,
        }
    ]


@pytest.mark.asyncio
async def test_create_session_returns_503_when_service_missing() -> None:
    settings = Settings(database_url="sqlite:///:memory:")
    app = create_app(settings)
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/chatkit/session")

    assert response.status_code == 503
    assert response.json()["detail"].startswith("ChatKit is not configured")
