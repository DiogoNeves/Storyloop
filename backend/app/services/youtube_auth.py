"""YouTube OAuth authentication helpers."""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

import google_auth_oauthlib.flow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

from app.config import Settings

if TYPE_CHECKING:
    from collections.abc import Sequence

logger = logging.getLogger(__name__)

# YouTube OAuth scopes
YOUTUBE_SCOPES = [
    "https://www.googleapis.com/auth/youtube.readonly",
]


class YoutubeAuthError(RuntimeError):
    """Base exception for YouTube OAuth errors."""


class YoutubeAuthConfigurationError(YoutubeAuthError):
    """Raised when required OAuth configuration is missing."""


class YoutubeAuthStateMismatch(YoutubeAuthError):
    """Raised when OAuth state doesn't match (CSRF protection)."""


class YoutubeAuthService:
    """High-level operations for YouTube OAuth authentication."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        if not settings.youtube_client_id or not settings.youtube_client_secret:
            logger.warning(
                "YouTube OAuth credentials not configured. "
                "OAuth features will not be available."
            )

    def _get_redirect_uri(self) -> str:
        """Get the OAuth redirect URI, with a default if not configured."""
        if self.settings.youtube_redirect_uri:
            return self.settings.youtube_redirect_uri
        # Default to backend callback endpoint
        return "http://localhost:8000/youtube/auth/callback"

    def _create_flow(self) -> Flow:
        """Create an OAuth flow instance."""
        if not self.settings.youtube_client_id or not self.settings.youtube_client_secret:
            raise YoutubeAuthConfigurationError(
                "YouTube OAuth client ID and secret must be configured"
            )

        return google_auth_oauthlib.flow.Flow.from_client_config(
            {
                "web": {
                    "client_id": self.settings.youtube_client_id,
                    "client_secret": self.settings.youtube_client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [self._get_redirect_uri()],
                }
            },
            scopes=YOUTUBE_SCOPES,
            redirect_uri=self._get_redirect_uri(),
        )

    def generate_state(self) -> str:
        """Generate a random state string for CSRF protection."""
        return secrets.token_urlsafe(32)

    def get_authorization_url(self, state: str) -> str:
        """Generate the authorization URL for OAuth flow.

        Args:
            state: CSRF protection state token

        Returns:
            URL to redirect user to for authorization
        """
        flow = self._create_flow()
        authorization_url, _ = flow.authorization_url(
            access_type="offline",
            include_granted_scopes=True,
            state=state,
            prompt="consent",  # Force consent to get refresh token
        )
        return authorization_url

    def exchange_code_for_tokens(
        self, authorization_code: str, state: str, stored_state: str | None
    ) -> tuple[str, str | None, datetime | None]:
        """Exchange authorization code for access and refresh tokens.

        Args:
            authorization_code: Code from OAuth callback
            state: State from OAuth callback
            stored_state: Previously stored state for validation

        Returns:
            Tuple of (access_token, refresh_token, token_expiry)

        Raises:
            YoutubeAuthStateMismatch: If state doesn't match
        """
        if stored_state is None or state != stored_state:
            raise YoutubeAuthStateMismatch("OAuth state mismatch")

        flow = self._create_flow()
        flow.fetch_token(code=authorization_code)

        credentials = flow.credentials
        if not credentials.token:
            raise YoutubeAuthError("Failed to obtain access token")

        expiry = None
        if credentials.expiry:
            expiry = credentials.expiry

        return (
            credentials.token,
            credentials.refresh_token,
            expiry,
        )

    def refresh_access_token(self, refresh_token: str) -> tuple[str, datetime | None]:
        """Refresh an access token using a refresh token.

        Args:
            refresh_token: The refresh token to use

        Returns:
            Tuple of (access_token, token_expiry)
        """
        if not refresh_token:
            raise YoutubeAuthError("Refresh token is required")

        credentials = Credentials(
            token=None,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=self.settings.youtube_client_id,
            client_secret=self.settings.youtube_client_secret,
        )

        credentials.refresh(Request())

        if not credentials.token:
            raise YoutubeAuthError("Failed to refresh access token")

        expiry = None
        if credentials.expiry:
            expiry = credentials.expiry

        return (credentials.token, expiry)

    def get_authenticated_credentials(
        self, access_token: str, refresh_token: str | None = None
    ) -> Credentials:
        """Create Credentials object for authenticated API calls.

        Args:
            access_token: Current access token
            refresh_token: Optional refresh token for token refresh

        Returns:
            Credentials object ready for use with Google API clients
        """
        return Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=self.settings.youtube_client_id,
            client_secret=self.settings.youtube_client_secret,
        )

    async def fetch_channel_info(
        self, access_token: str, refresh_token: str | None = None
    ) -> dict[str, str | None]:
        """Fetch basic channel information using authenticated credentials.

        Args:
            access_token: Current access token
            refresh_token: Optional refresh token for token refresh

        Returns:
            Dictionary with channel_id, channel_title, and channel_thumbnail_url

        Raises:
            YoutubeAuthError: If channel info cannot be fetched
        """
        import httpx

        credentials = self.get_authenticated_credentials(access_token, refresh_token)

        # Refresh token if needed
        if credentials.expired and credentials.refresh_token:
            credentials.refresh(Request())

        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://www.googleapis.com/youtube/v3/channels",
                params={
                    "part": "snippet",
                    "mine": "true",
                    "maxResults": 1,
                },
                headers={"Authorization": f"Bearer {credentials.token}"},
            )
            response.raise_for_status()
            data = response.json()

        items = data.get("items", [])
        if not items:
            raise YoutubeAuthError("No channel found for authenticated user")

        channel = items[0]
        snippet = channel.get("snippet", {})
        channel_id = channel.get("id")
        channel_title = snippet.get("title") if isinstance(snippet, dict) else None
        thumbnails = snippet.get("thumbnails", {}) if isinstance(snippet, dict) else {}
        thumbnail_url = None
        if isinstance(thumbnails, dict):
            # Prefer high quality thumbnail
            for quality in ("high", "medium", "default"):
                if quality in thumbnails:
                    thumb = thumbnails[quality]
                    if isinstance(thumb, dict) and "url" in thumb:
                        thumbnail_url = thumb["url"]
                        break

        return {
            "channel_id": channel_id,
            "channel_title": channel_title,
            "channel_thumbnail_url": thumbnail_url,
        }


__all__ = [
    "YoutubeAuthError",
    "YoutubeAuthConfigurationError",
    "YoutubeAuthStateMismatch",
    "YoutubeAuthService",
]
