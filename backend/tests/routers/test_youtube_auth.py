from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from google.oauth2.credentials import Credentials
from httpx import ASGITransport, AsyncClient
from oauthlib.oauth2.rfc6749.errors import InvalidGrantError  # type: ignore[import-untyped]

from app.config import Settings
from app.main import create_app
from app.services.users import UserService


class FakeCredentials(Credentials):
    def __init__(self, *, expired: bool = False) -> None:
        # Initialize with minimal required parameters
        super().__init__(token="fake-token")
        now = datetime.now(tz=UTC)
        self.expiry = now - timedelta(hours=1) if expired else now + timedelta(hours=1)
        self._refresh_token = "refresh-token"

    @property
    def refresh_token(self) -> str:
        return self._refresh_token

    def to_json(self, strip: Any = None) -> Any:  # pragma: no cover - simple passthrough
        return '{"token": "abc"}'


class FakeFlow:
    def __init__(
        self, *, state: str, token_error: Exception | None = None
    ) -> None:
        self._state = state
        self._credentials = FakeCredentials()
        self.authorization_called = False
        self.fetched_code: str | None = None
        self._token_error = token_error

    def authorization_url(self, **_: Any) -> tuple[str, str]:
        self.authorization_called = True
        return (
            "https://accounts.google.com/o/oauth2/auth?state=" + self._state,
            self._state,
        )

    def fetch_token(self, *, code: str) -> None:
        if self._token_error is not None:
            raise self._token_error
        self.fetched_code = code

    @property
    def credentials(self) -> FakeCredentials:
        return self._credentials


class FakeOAuthService:
    def __init__(self) -> None:
        self.latest_flow: FakeFlow | None = None
        self._credentials = FakeCredentials()
        self.refreshed = False
        self.token_error: Exception | None = None

    def create_flow(self, *, state: str | None = None) -> FakeFlow:
        flow_state = state or "generated-state"
        self.latest_flow = FakeFlow(
            state=flow_state, token_error=self.token_error
        )
        return self.latest_flow

    def serialize_credentials(self, credentials: FakeCredentials) -> str:
        return credentials.to_json()

    def deserialize_credentials(self, credentials_json: str) -> FakeCredentials:
        return self._credentials

    def refresh_credentials(self, credentials: FakeCredentials) -> None:
        credentials.expiry = datetime.now(tz=UTC) + timedelta(hours=1)
        self.refreshed = True


class FakeChannelsList:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def execute(self) -> dict[str, Any]:
        return self._payload


class FakeChannelsResource:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def list(self, **_: Any) -> FakeChannelsList:
        return FakeChannelsList(self._payload)


class FakeYoutubeClient:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def channels(self) -> FakeChannelsResource:
        return FakeChannelsResource(self._payload)


class FakeYoutubeService:
    def __init__(self, payload: dict[str, Any]) -> None:
        self.payload = payload
        self.called = False

    def build_authenticated_client(
        self, *_: Any, **__: Any
    ) -> FakeYoutubeClient:
        self.called = True
        return FakeYoutubeClient(self.payload)


def create_test_app() -> tuple[Any, FakeOAuthService, FakeYoutubeService]:
    settings = Settings.model_validate(
        {
            "DATABASE_URL": "sqlite:///:memory:",
            "YOUTUBE_API_KEY": "test-key",
            "YOUTUBE_OAUTH_CLIENT_ID": "client-id",
            "YOUTUBE_OAUTH_CLIENT_SECRET": "client-secret",
            "YOUTUBE_REDIRECT_URI": "http://localhost:8000/youtube/auth/callback",
            "CORS_ORIGINS": ["http://frontend.test"],
            "SMART_ENTRIES_SCHEDULER_ENABLED": False,
        }
    )
    app = create_app(settings)
    fake_oauth = FakeOAuthService()
    fake_youtube = FakeYoutubeService(
        {
            "items": [
                {
                    "id": "UC123",
                    "snippet": {
                        "title": "Storyloop",
                        "thumbnails": {
                            "default": {
                                "url": "https://img.youtube.com/123.jpg"
                            }
                        },
                    },
                    "contentDetails": {
                        "relatedPlaylists": {"uploads": "UU123"}
                    },
                }
            ]
        }
    )
    app.dependency_overrides.clear()
    from app.dependencies import (  # local import to avoid circular
        get_youtube_oauth_service,
        get_youtube_service,
    )

    app.dependency_overrides[get_youtube_oauth_service] = lambda: fake_oauth
    app.dependency_overrides[get_youtube_service] = lambda: fake_youtube
    # ensure the app state also reflects fakes for routes that access it directly
    app.state.youtube_oauth_service = fake_oauth
    app.state.youtube_service = fake_youtube

    return app, fake_oauth, fake_youtube


@pytest.mark.asyncio
async def test_start_returns_authorization_url_and_persists_state() -> None:
    app, fake_oauth, _ = create_test_app()

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            response = await client.post("/youtube/auth/start")
            user_service: UserService = app.state.user_service
            record = user_service.get_active_user()

    assert response.status_code == 200
    payload = response.json()
    assert "authorizationUrl" in payload
    assert fake_oauth.latest_flow is not None
    assert payload["state"] == fake_oauth.latest_flow._state
    assert record is not None
    assert record.oauth_state == payload["state"]


@pytest.mark.asyncio
async def test_status_reports_link_state() -> None:
    app, fake_oauth, _ = create_test_app()
    fake_oauth._credentials = FakeCredentials(expired=True)

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            user_service: UserService = app.state.user_service
            user_service.upsert_credentials(
                '{"token": "abc"}', datetime.now(tz=UTC)
            )
            user_service.update_channel_info(
                channel_id="UC123",
                channel_title="Storyloop",
                channel_url="https://www.youtube.com/channel/UC123",
                thumbnail_url="https://img.youtube.com/123.jpg",
                updated_at=datetime.now(tz=UTC),
            )
            response = await client.get("/youtube/auth/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["linked"] is True
    assert payload["refreshNeeded"] is True
    assert payload["channel"]["id"] == "UC123"
    assert payload["statusMessage"] is None


@pytest.mark.asyncio
async def test_status_includes_unlink_reason() -> None:
    app, _, _ = create_test_app()

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            user_service: UserService = app.state.user_service
            user_service.upsert_credentials(
                None,
                None,
                error_message="Stored credentials are no longer valid.",
            )
            response = await client.get("/youtube/auth/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["linked"] is False
    assert payload["statusMessage"] == "Stored credentials are no longer valid."


@pytest.mark.asyncio
async def test_unlink_clears_channel_and_credentials() -> None:
    app, _, _ = create_test_app()

    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            user_service: UserService = app.state.user_service
            now = datetime.now(tz=UTC)
            user_service.upsert_credentials("{\"token\": \"abc\"}", now)
            user_service.update_channel_info(
                channel_id="UC123",
                channel_title="Storyloop",
                channel_url="https://www.youtube.com/channel/UC123",
                thumbnail_url="https://img.youtube.com/123.jpg",
                updated_at=now,
            )

            response = await client.post("/youtube/auth/unlink")

            record = user_service.get_active_user()

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert record is not None
    assert record.credentials_json is None
    assert record.channel_id is None
    assert record.channel_title is None
    assert record.channel_url is None
    assert record.channel_thumbnail_url is None


@pytest.mark.asyncio
async def test_complete_post_exchanges_code_and_updates_user() -> None:
    app, fake_oauth, fake_youtube = create_test_app()
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            user_service: UserService = app.state.user_service
            now = datetime.now(tz=UTC) - timedelta(minutes=5)
            user_service.save_oauth_state("state-token", now)
            response = await client.post(
                "/youtube/auth/complete",
                json={"code": "auth-code", "state": "state-token"},
            )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert fake_youtube.called is True
    assert fake_oauth.latest_flow is not None
    assert fake_oauth.latest_flow.fetched_code == "auth-code"

    record = app.state.user_service.get_active_user()
    assert record is not None
    assert record.credentials_json is not None
    assert record.channel_id == "UC123"
    assert record.oauth_state is None


@pytest.mark.asyncio
async def test_complete_post_maps_oauth2_error_to_client_failure() -> None:
    app, _, fake_youtube = create_test_app()
    app.state.youtube_oauth_service.token_error = InvalidGrantError(
        description="Code was already redeemed."
    )
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            user_service: UserService = app.state.user_service
            now = datetime.now(tz=UTC) - timedelta(minutes=5)
            user_service.save_oauth_state("state-token", now)
            response = await client.post(
                "/youtube/auth/complete",
                json={"code": "expired-code", "state": "state-token"},
            )

    assert response.status_code == 400
    payload = response.json()
    assert payload["detail"].startswith("Failed to exchange OAuth code:")
    assert fake_youtube.called is False


@pytest.mark.asyncio
async def test_callback_exchanges_code_and_updates_user() -> None:
    app, fake_oauth, fake_youtube = create_test_app()
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            user_service: UserService = app.state.user_service
            now = datetime.now(tz=UTC) - timedelta(minutes=5)
            user_service.save_oauth_state("state-token", now)
            response = await client.get(
                "/youtube/auth/callback",
                params={"code": "auth-code", "state": "state-token"},
                follow_redirects=False,
            )

    assert response.status_code == 302
    assert response.headers["location"] == "http://frontend.test"
    assert fake_youtube.called is True
    assert fake_oauth.latest_flow is not None
    assert fake_oauth.latest_flow.fetched_code == "auth-code"

    record = app.state.user_service.get_active_user()
    assert record is not None
    assert record.credentials_json is not None
    assert record.channel_id == "UC123"
    assert record.oauth_state is None
