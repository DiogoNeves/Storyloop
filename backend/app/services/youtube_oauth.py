"""Helpers for managing YouTube OAuth credentials.

This service provides utilities for constructing Google OAuth flows and managing
credential serialization/deserialization for YouTube API access. It wraps the
Google Auth libraries (`google_auth_oauthlib.flow.Flow` and
`google.oauth2.credentials.Credentials`) with a simplified interface.

See `app.routers.youtube_auth` for endpoint-level documentation on the OAuth
flow.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Sequence

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

from app.config import Settings
from app.services.youtube import YoutubeConfigurationError


YOUTUBE_OAUTH_SCOPES: Sequence[str] = (
    "https://www.googleapis.com/auth/youtube.readonly",
)


@dataclass(slots=True)
class _OAuthClientConfig:
    client_id: str
    client_secret: str
    redirect_uri: str

    def as_dict(self) -> dict[str, Any]:
        """Return the structure expected by google-auth libraries."""

        return {
            "web": {
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [self.redirect_uri],
            }
        }


class YoutubeOAuthService:
    """Construct Google OAuth flows and manage credential serialization."""

    def __init__(self, settings: Settings) -> None:
        if not settings.youtube_client_id:
            msg = "Missing YOUTUBE_OAUTH_CLIENT_ID configuration."
            raise YoutubeConfigurationError(msg)
        if not settings.youtube_client_secret:
            msg = "Missing YOUTUBE_OAUTH_CLIENT_SECRET configuration."
            raise YoutubeConfigurationError(msg)
        if not settings.youtube_redirect_uri:
            msg = "Missing YOUTUBE_REDIRECT_URI configuration."
            raise YoutubeConfigurationError(msg)

        self._config = _OAuthClientConfig(
            client_id=settings.youtube_client_id,
            client_secret=settings.youtube_client_secret,
            redirect_uri=settings.youtube_redirect_uri,
        )

    @property
    def redirect_uri(self) -> str:
        """Expose the configured redirect URI."""

        return self._config.redirect_uri

    def create_flow(self, *, state: str | None = None) -> Flow:
        """Build a configured Google OAuth flow instance."""

        flow = Flow.from_client_config(
            self._config.as_dict(), scopes=YOUTUBE_OAUTH_SCOPES, state=state
        )
        flow.redirect_uri = self._config.redirect_uri
        return flow

    def serialize_credentials(self, credentials: Credentials) -> str:
        """Return a JSON payload representing the credentials."""

        return credentials.to_json()

    def deserialize_credentials(self, credentials_json: str) -> Credentials:
        """Load credentials from stored JSON."""

        data = json.loads(credentials_json)
        return Credentials.from_authorized_user_info(
            data, scopes=YOUTUBE_OAUTH_SCOPES
        )

    def refresh_credentials(self, credentials: Credentials) -> None:
        """Refresh credentials in-place when they are expired."""

        if credentials.expired and credentials.refresh_token:
            credentials.refresh(Request())
