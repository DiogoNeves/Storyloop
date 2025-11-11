from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app


class DummyResponse:
    def __init__(self, status_code: int, payload: dict[str, Any]) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict[str, Any]:
        return self._payload


class DummyAsyncClient:
    def __init__(self, response: DummyResponse, requests: list[dict[str, Any]]) -> None:
        self._response = response
        self._requests = requests

    async def __aenter__(self) -> "DummyAsyncClient":
        return self

    async def __aexit__(self, *_: Any) -> None:
        return None

    async def post(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        json: dict[str, Any] | None = None,
    ) -> DummyResponse:
        self._requests.append({"url": url, "headers": headers, "json": json})
        return self._response


class DummyAsyncClientFactory:
    def __init__(self, response: DummyResponse) -> None:
        self.response = response
        self.requests: list[dict[str, Any]] = []

    def __call__(self, *_: Any, **__: Any) -> DummyAsyncClient:
        return DummyAsyncClient(self.response, self.requests)


@pytest.mark.asyncio
async def test_create_chatkit_session_returns_client_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(
        DATABASE_URL="sqlite:///:memory:",
        OPENAI_API_KEY="test-api-key",
        CHATKIT_WORKFLOW_ID="wf_123",
    )
    app = create_app(settings)

    response_payload = {
        "client_secret": "secret-123",
        "expires_after": "2024-01-01T00:00:00Z",
    }
    factory = DummyAsyncClientFactory(DummyResponse(200, response_payload))
    monkeypatch.setattr("app.routers.chatkit.httpx.AsyncClient", factory)

    async with app.router.lifespan_context(app):
        user_service = app.state.user_service
        user_service.update_channel_info(
            channel_id="UC123",
            channel_title="Storyloop",
            channel_url="https://www.youtube.com/channel/UC123",
            thumbnail_url="https://img.youtube.com/uc123.jpg",
            updated_at=datetime.now(tz=UTC),
        )

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            response = await client.post("/chatkit/session")

    assert response.status_code == 200
    assert response.json() == {
        "clientSecret": "secret-123",
        "expiresAfter": "2024-01-01T00:00:00Z",
    }

    assert len(factory.requests) == 1
    request_payload = factory.requests[0]
    assert (
        request_payload["url"]
        == "https://api.openai.com/v1/chatkit/sessions"
    )
    request_json = request_payload["json"]
    assert request_json["workflow_id"] == "wf_123"
    metadata = request_json["metadata"]
    assert metadata["userId"] == "active"
    assert metadata["channelId"] == "UC123"
    assert metadata["channelTitle"] == "Storyloop"
    assert metadata["channelUrl"] == "https://www.youtube.com/channel/UC123"
    assert (
        metadata["channelThumbnailUrl"]
        == "https://img.youtube.com/uc123.jpg"
    )
    assert request_payload["headers"] == {
        "Authorization": "Bearer test-api-key",
        "OpenAI-Beta": "chatkit_beta=v1",
    }


@pytest.mark.asyncio
async def test_create_chatkit_session_missing_configuration() -> None:
    settings = Settings(DATABASE_URL="sqlite:///:memory:")
    app = create_app(settings)

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            response = await client.post("/chatkit/session")

    assert response.status_code == 503
    assert response.json() == {"detail": "ChatKit is not configured."}


@pytest.mark.asyncio
async def test_create_chatkit_session_upstream_error(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(
        DATABASE_URL="sqlite:///:memory:",
        OPENAI_API_KEY="test-api-key",
        CHATKIT_WORKFLOW_ID="wf_123",
    )
    app = create_app(settings)

    factory = DummyAsyncClientFactory(
        DummyResponse(500, {"error": {"message": "upstream failure"}})
    )
    monkeypatch.setattr("app.routers.chatkit.httpx.AsyncClient", factory)

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            response = await client.post("/chatkit/session")

    assert response.status_code == 502
    assert response.json() == {"detail": "ChatKit session creation failed."}
