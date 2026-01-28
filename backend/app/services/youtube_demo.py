"""Demo-only YouTube service that replays canned API responses.

This module provides demo implementations of YouTube services that use pre-recorded
fixture data instead of making real API calls. This is useful for development,
testing, and demonstrations without requiring YouTube API credentials or OAuth setup.

To enable demo mode, set the YOUTUBE_DEMO_MODE environment variable to true.
Optionally, specify a fixture scenario with YOUTUBE_DEMO_SCENARIO (defaults to "baseline").

See backend/README.md for detailed documentation on demo mode usage and fixture structure.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any, Mapping

import httpx
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

from app.services.youtube import (
    YoutubeAPIRequestError,
    YoutubeApiClient,
    YoutubeFeed,
    YoutubeService,
)
from app.services.youtube_oauth import (
    YOUTUBE_OAUTH_SCOPES,
    YoutubeOAuthService,
)
from app.services.users import UserRecord, UserService

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

FIXTURE_ROOT = Path(__file__).resolve().parent.parent / "fixtures" / "youtube"
IGNORE_PARAMS = {"key", "access_token", "oauth_token"}


class FixtureLoader:
    """Load JSON payloads from the YouTube demo fixture bundle."""

    def __init__(self, scenario: str) -> None:
        self.scenario = scenario
        self.base_path = FIXTURE_ROOT / scenario
        if not self.base_path.exists():
            raise FileNotFoundError(
                f"YouTube demo fixture scenario '{scenario}' is not available"
            )

    def load(
        self,
        endpoint: str,
        operation: str = "list",
        params: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Return the fixture payload for the requested endpoint."""
        candidates = self._candidate_paths(endpoint, operation, params)
        for path in candidates:
            if path.exists():
                with path.open(encoding="utf-8") as handle:
                    return json.load(handle)
        formatted = " -> ".join(str(path) for path in candidates)
        raise FileNotFoundError(
            f"No fixture found for {endpoint}.{operation} with params {params}."
            f" Checked: {formatted}"
        )

    def _candidate_paths(
        self,
        endpoint: str,
        operation: str,
        params: Mapping[str, Any] | None,
    ) -> list[Path]:
        filtered = self._filter_params(params)
        suffixes: list[str] = []
        if filtered:
            suffixes.append(self._params_to_suffix(filtered))
            if "pageToken" in filtered:
                without_page = dict(filtered)
                without_page.pop("pageToken", None)
                if without_page:
                    suffixes.append(self._params_to_suffix(without_page))

            # For handle/username lookups, add fallback to ID-based fixture
            # This allows any handle/username to resolve to the demo channel
            if "forHandle" in filtered or "forUsername" in filtered:
                id_fallback = dict(filtered)
                # Remove handle/username params and add ID param
                id_fallback.pop("forHandle", None)
                id_fallback.pop("forUsername", None)
                id_fallback["id"] = "UCDEMOCHANNEL"
                if id_fallback:
                    suffixes.append(self._params_to_suffix(id_fallback))

        suffixes.append("default")

        candidates: list[Path] = []
        for suffix in suffixes:
            candidates.append(
                self.base_path / endpoint / operation / f"{suffix}.json"
            )
            candidates.append(self.base_path / endpoint / f"{suffix}.json")
        return candidates

    def _filter_params(
        self, params: Mapping[str, Any] | None
    ) -> dict[str, Any]:
        if not params:
            return {}
        filtered = {
            key: value
            for key, value in params.items()
            if key not in IGNORE_PARAMS and value not in (None, "")
        }
        return filtered

    def _params_to_suffix(self, params: Mapping[str, Any]) -> str:
        parts: list[str] = []
        for key, value in sorted(params.items()):
            normalized_value = self._sanitize_value(value)
            parts.append(f"{key}-{normalized_value}")
        return "__".join(parts) if parts else "default"

    def _sanitize_value(self, value: Any) -> str:
        if isinstance(value, bool):
            value_str = "true" if value else "false"
        elif isinstance(value, (int, float)):
            value_str = str(value)
        else:
            value_str = str(value)
        # Collapse separators to make filesystem-friendly names.
        value_str = value_str.replace(",", "_")
        sanitized = re.sub(r"[^A-Za-z0-9._-]", "-", value_str)
        sanitized = re.sub(r"-+", "-", sanitized).strip("-")
        return sanitized or "value"


class FakeYoutubeRequest:
    """Minimal object that mimics googleapiclient request wrappers."""

    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def execute(self) -> dict[str, Any]:
        return self._payload


class FakeYoutubeResource:
    """Expose list() returning FakeYoutubeRequest objects."""

    def __init__(self, loader: FixtureLoader, endpoint: str) -> None:
        self._loader = loader
        self._endpoint = endpoint

    def list(self, **kwargs: Any) -> FakeYoutubeRequest:
        payload = self._loader.load(self._endpoint, "list", kwargs)
        return FakeYoutubeRequest(payload)


class FakeYoutubeApiClient(YoutubeApiClient):
    """Fake client implementing the small subset of methods the app needs."""

    def __init__(self, loader: FixtureLoader) -> None:
        self._loader = loader

    def channels(self) -> FakeYoutubeResource:  # type: ignore[override]
        return FakeYoutubeResource(self._loader, "channels")

    def playlistItems(self) -> FakeYoutubeResource:  # type: ignore[override]
        return FakeYoutubeResource(self._loader, "playlistItems")

    def videos(self) -> FakeYoutubeResource:  # type: ignore[override]
        return FakeYoutubeResource(self._loader, "videos")


class DemoYoutubeOAuthService(YoutubeOAuthService):
    """Demo OAuth service that always returns valid demo credentials."""

    def __init__(self) -> None:
        # Create minimal Settings for parent initialization
        # Parent requires OAuth config, but we'll override methods anyway
        from app.config import Settings

        dummy_settings = Settings(
            YOUTUBE_OAUTH_CLIENT_ID="demo_client_id",
            YOUTUBE_OAUTH_CLIENT_SECRET="demo_client_secret",
            YOUTUBE_REDIRECT_URI="http://localhost:5173/youtube/auth/callback",
        )
        super().__init__(dummy_settings)

    @property
    def redirect_uri(self) -> str:
        """Return demo redirect URI."""
        return "http://localhost:5173/youtube/auth/callback"

    def create_flow(self, *, state: str | None = None) -> Flow:
        """Create a demo OAuth flow (may not be used in demo mode)."""
        # In demo mode, OAuth flow endpoints may not be used
        # But if they are, we need to return something that won't crash
        # For now, raise an error indicating demo mode doesn't support OAuth flows
        raise YoutubeAPIRequestError(
            "OAuth flow is not supported in demo mode. Use demo fixtures instead."
        )

    def deserialize_credentials(self, credentials_json: str) -> Credentials:
        """Return demo credentials that are always valid."""
        # Create a minimal credentials object that won't expire
        # The demo service doesn't actually use these credentials
        data = (
            json.loads(credentials_json)
            if isinstance(credentials_json, str)
            else credentials_json
        )
        # Ensure credentials appear valid (not expired)
        if isinstance(data, dict):
            data.setdefault("expiry", None)  # No expiry
            data.setdefault("token", "demo_token")
            data.setdefault("refresh_token", "demo_refresh_token")
        return Credentials.from_authorized_user_info(
            data if isinstance(data, dict) else {}, scopes=YOUTUBE_OAUTH_SCOPES
        )

    def serialize_credentials(self, credentials: Credentials) -> str:
        """Serialize demo credentials."""
        return credentials.to_json()

    def refresh_credentials(self, credentials: Credentials) -> None:
        """No-op for demo mode - credentials never expire."""
        pass


class DemoUserService(UserService):
    """Demo user service that always returns a user with demo credentials."""

    def __init__(self, real_user_service: UserService) -> None:
        # Store reference to real service for delegation
        self._real_service = real_user_service
        # Use the same connection factory
        super().__init__(real_user_service._connection_factory)

    def get_active_user(self) -> UserRecord:
        """Always return a demo user with credentials."""
        # Try to get real user first, but if none exists, return demo user
        real_user = self._real_service.get_active_user()
        if real_user is not None and real_user.credentials_json:
            return real_user

        # Return demo user with demo channel info
        demo_credentials = json.dumps(
            {
                "token": "demo_access_token",
                "refresh_token": "demo_refresh_token",
                "token_uri": "https://oauth2.googleapis.com/token",
                "client_id": "demo_client_id",
                "client_secret": "demo_client_secret",
                "scopes": list(YOUTUBE_OAUTH_SCOPES),
            }
        )

        return UserRecord(
            id="active",
            channel_id="UCDEMOCHANNEL",
            channel_title="Storyloop Demo Channel",
            channel_url="https://www.youtube.com/channel/UCDEMOCHANNEL",
            channel_thumbnail_url="https://example.com/demo/high.jpg",
            channel_updated_at=datetime.now(tz=UTC),
            channel_profile_json=None,
            channel_profile_updated_at=None,
            credentials_json=demo_credentials,
            credentials_updated_at=datetime.now(tz=UTC),
            credentials_error=None,
            oauth_state=None,
            oauth_state_created_at=None,
            smart_update_interval_hours=None,
        )

    # Delegate all other methods to real service
    def ensure_schema(self) -> None:
        return self._real_service.ensure_schema()

    def upsert_credentials(
        self,
        credentials_json: str | None,
        refreshed_at: datetime | None,
        *,
        error_message: str | None = None,
    ) -> None:
        return self._real_service.upsert_credentials(
            credentials_json,
            refreshed_at,
            error_message=error_message,
        )

    def update_channel_info(
        self,
        *,
        channel_id: str,
        channel_title: str | None,
        channel_url: str | None,
        thumbnail_url: str | None,
        updated_at: datetime | None,
    ) -> None:
        return self._real_service.update_channel_info(
            channel_id=channel_id,
            channel_title=channel_title,
            channel_url=channel_url,
            thumbnail_url=thumbnail_url,
            updated_at=updated_at,
        )

    def save_oauth_state(self, state: str, created_at: datetime) -> None:
        return self._real_service.save_oauth_state(state, created_at)

    def clear_oauth_state(self) -> None:
        return self._real_service.clear_oauth_state()


class DemoYoutubeService(YoutubeService):
    """YouTube service variant that sources responses from fixture bundles."""

    def __init__(
        self,
        *,
        scenario: str | None = None,
        api_key: str | None = "demo",
        transport: httpx.AsyncBaseTransport | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        super().__init__(
            api_key=api_key or "demo", transport=transport, client=client
        )
        selected_scenario = (
            scenario or os.getenv("YOUTUBE_DEMO_SCENARIO") or "baseline"
        )
        try:
            self._fixture_loader = FixtureLoader(selected_scenario)
        except (
            FileNotFoundError
        ) as exc:  # pragma: no cover - configuration error
            raise YoutubeAPIRequestError(str(exc)) from exc
        self._scenario = selected_scenario

    async def _request_json(
        self, client: httpx.AsyncClient, endpoint: str, params: dict[str, Any]
    ) -> dict[str, Any]:
        try:
            return self._fixture_loader.load(endpoint, "list", params)
        except FileNotFoundError as exc:
            logger.error("Missing YouTube demo fixture: %s", exc)
            raise YoutubeAPIRequestError(str(exc)) from exc

    def build_authenticated_client(
        self,
        user_service: Any,
        oauth_service: Any,
    ) -> FakeYoutubeApiClient:
        return FakeYoutubeApiClient(self._fixture_loader)

    async def fetch_channel_feed(
        self,
        channel: str,
        *,
        video_type: str | None = None,
        user_service: Any | None = None,
        oauth_service: Any | None = None,
        max_results: int = 50,
    ) -> YoutubeFeed:
        """Return recent uploads using demo fixtures.

        In demo mode, always uses authenticated method with fixtures.
        Assumes user_service and oauth_service are provided via dependency injection.
        """
        # In demo mode, always use authenticated method with fixtures
        # Services should be provided via dependency injection
        if user_service is None or oauth_service is None:
            raise YoutubeAPIRequestError(
                "Demo mode requires user_service and oauth_service to be provided"
            )

        # Always use authenticated method in demo mode, mirroring production behavior
        return await self.fetch_authenticated_channel_videos(
            user_service,
            oauth_service,
            channel_id=channel,
            max_results=max_results,
            video_type=video_type,
        )


__all__ = [
    "DemoYoutubeService",
    "DemoYoutubeOAuthService",
    "DemoUserService",
    "FakeYoutubeApiClient",
]
