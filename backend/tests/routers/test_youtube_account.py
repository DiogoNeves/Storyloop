"""Tests for YouTube account router endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app
from app.services.youtube_account import YoutubeAccountService


class FakeCredentials:
    def __init__(self, *, expired: bool = False) -> None:
        self._expired = expired
        self._refresh_token = "refresh-token"

    @property
    def expired(self) -> bool:
        return self._expired

    @property
    def refresh_token(self) -> str:
        return self._refresh_token

    def to_json(self) -> str:
        return '{"token": "abc"}'


class FakeChannelsList:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def execute(self) -> dict[str, Any]:
        return self._payload


class FakeChannelsResource:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def list(self, **kwargs: Any) -> FakeChannelsList:
        return FakeChannelsList(self._payload)


class FakePlaylistItemsList:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def execute(self) -> dict[str, Any]:
        return self._payload


class FakePlaylistItemsResource:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def list(self, **kwargs: Any) -> FakePlaylistItemsList:
        return FakePlaylistItemsList(self._payload)


class FakeVideosList:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def execute(self) -> dict[str, Any]:
        return self._payload


class FakeVideosResource:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def list(self, **kwargs: Any) -> FakeVideosList:
        return FakeVideosList(self._payload)


class FakeYoutubeClient:
    def __init__(
        self,
        *,
        channel_payload: dict[str, Any] | None = None,
        playlist_payload: dict[str, Any] | None = None,
        videos_payload: dict[str, Any] | None = None,
    ) -> None:
        self._channel_payload = channel_payload or {}
        self._playlist_payload = playlist_payload or {}
        self._videos_payload = videos_payload or {}

    def channels(self) -> FakeChannelsResource:
        return FakeChannelsResource(self._channel_payload)

    def playlistItems(self) -> FakePlaylistItemsResource:
        return FakePlaylistItemsResource(self._playlist_payload)

    def videos(self) -> FakeVideosResource:
        return FakeVideosResource(self._videos_payload)


class FakeYoutubeService:
    def __init__(self, client: FakeYoutubeClient) -> None:
        self._client = client

    def build_authenticated_client(self, *_: Any, **__: Any) -> FakeYoutubeClient:
        return self._client


class FakeOAuthService:
    pass


def create_test_app() -> tuple[Any, FakeYoutubeService]:
    """Create test app with mocked dependencies."""
    settings = Settings(
        DATABASE_URL="sqlite:///:memory:",
        YOUTUBE_API_KEY="test-key",
        YOUTUBE_OAUTH_CLIENT_ID="client-id",
        YOUTUBE_OAUTH_CLIENT_SECRET="client-secret",
        YOUTUBE_REDIRECT_URI="http://localhost:8000/youtube/auth/callback",
        CORS_ORIGINS="http://frontend.test",
    )
    app = create_app(settings)

    channel_payload = {
        "items": [
            {
                "id": "UC123",
                "snippet": {
                    "title": "Test Channel",
                    "customUrl": "@testchannel",
                    "thumbnails": {
                        "high": {"url": "https://example.com/thumb.jpg"},
                    },
                    "publishedAt": "2024-01-01T00:00:00Z",
                },
            }
        ]
    }

    playlist_payload = {
        "items": [
            {
                "snippet": {
                    "title": "Video 1",
                    "description": "Description",
                    "publishedAt": "2024-01-01T12:00:00Z",
                    "resourceId": {"videoId": "vid1"},
                    "thumbnails": {
                        "medium": {"url": "https://example.com/thumb1.jpg"}
                    },
                    "liveBroadcastContent": "none",
                },
                "contentDetails": {},
            }
        ]
    }

    videos_payload = {
        "items": [
            {
                "id": "vid1",
                "contentDetails": {"duration": "PT300S"},
                "snippet": {
                    "title": "Video 1",
                    "description": "Description",
                    "publishedAt": "2024-01-01T12:00:00Z",
                    "thumbnails": {
                        "medium": {"url": "https://example.com/thumb1.jpg"}
                    },
                    "liveBroadcastContent": "none",
                },
            }
        ]
    }

    fake_client = FakeYoutubeClient(
        channel_payload=channel_payload,
        playlist_payload=playlist_payload,
        videos_payload=videos_payload,
    )
    fake_youtube = FakeYoutubeService(fake_client)

    app.dependency_overrides.clear()
    from app.dependencies import (  # local import to avoid circular
        get_youtube_oauth_service,
        get_youtube_service,
    )

    fake_oauth = FakeOAuthService()
    app.dependency_overrides[get_youtube_oauth_service] = lambda: fake_oauth
    app.dependency_overrides[get_youtube_service] = lambda: fake_youtube
    app.state.youtube_oauth_service = fake_oauth
    app.state.youtube_service = fake_youtube

    return app, fake_youtube


@pytest.mark.asyncio
async def test_get_my_channel_returns_persisted_data() -> None:
    """Test that GET /youtube/me/channel returns persisted channel data."""
    app, _ = create_test_app()

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            from app.services.users import UserService

            user_service: UserService = app.state.user_service
            user_service.ensure_schema()
            user_service.upsert_credentials(
                '{"token": "abc"}', datetime.now(tz=UTC)
            )
            user_service.update_channel_info(
                channel_id="UC123",
                channel_title="Persisted Channel",
                channel_url="https://www.youtube.com/channel/UC123",
                thumbnail_url="https://example.com/persisted.jpg",
                updated_at=datetime.now(tz=UTC),
            )

            response = await client.get("/youtube/me/channel")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == "UC123"
    assert payload["title"] == "Persisted Channel"
    assert payload["url"] == "https://www.youtube.com/channel/UC123"


@pytest.mark.asyncio
async def test_get_my_channel_fetches_when_missing() -> None:
    """Test that GET /youtube/me/channel fetches from API when data missing."""
    app, _ = create_test_app()

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            from app.services.users import UserService

            user_service: UserService = app.state.user_service
            user_service.ensure_schema()
            user_service.upsert_credentials(
                '{"token": "abc"}', datetime.now(tz=UTC)
            )

            response = await client.get("/youtube/me/channel")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == "UC123"
    assert payload["title"] == "Test Channel"
    assert payload["url"] == "https://www.youtube.com/@testchannel"


@pytest.mark.asyncio
async def test_get_my_channel_requires_linked_account() -> None:
    """Test that GET /youtube/me/channel returns 401 when account not linked."""
    app, _ = create_test_app()

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            response = await client.get("/youtube/me/channel")

    assert response.status_code == 401
    assert "not linked" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_get_my_videos_returns_videos() -> None:
    """Test that GET /youtube/me/videos returns video list."""
    app, _ = create_test_app()

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            from app.services.users import UserService

            user_service: UserService = app.state.user_service
            user_service.ensure_schema()
            user_service.upsert_credentials(
                '{"token": "abc"}', datetime.now(tz=UTC)
            )

            response = await client.get("/youtube/me/videos")

    assert response.status_code == 200
    payload = response.json()
    assert "channel" in payload
    assert "videos" in payload
    assert len(payload["videos"]) == 1
    assert payload["videos"][0]["id"] == "vid1"
    assert payload["videos"][0]["videoType"] == "video"


@pytest.mark.asyncio
async def test_get_my_videos_requires_linked_account() -> None:
    """Test that GET /youtube/me/videos returns 401 when account not linked."""
    app, _ = create_test_app()

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            response = await client.get("/youtube/me/videos")

    assert response.status_code == 401
    assert "not linked" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_get_my_videos_respects_max_results() -> None:
    """Test that GET /youtube/me/videos respects max_results parameter."""
    app, _ = create_test_app()

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            from app.services.users import UserService

            user_service: UserService = app.state.user_service
            user_service.ensure_schema()
            user_service.upsert_credentials(
                '{"token": "abc"}', datetime.now(tz=UTC)
            )

            response = await client.get("/youtube/me/videos?max_results=5")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["videos"]) <= 5

