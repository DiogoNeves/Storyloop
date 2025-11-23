"""OAuth endpoints for YouTube authentication.

This module implements the OAuth 2.0 authorization code flow for YouTube API
access through three endpoints:

**`POST /youtube/auth/start`**:
    Initiates the OAuth flow by generating an authorization URL. Uses
    `YoutubeOAuthService.create_flow()` to create a Google OAuth flow instance
    with a state parameter for CSRF protection. The state is persisted in the
    database, and the authorization URL is returned to the frontend for the user
    to visit.

**`GET /youtube/auth/callback`**:
    Handles Google's redirect after user consent (legacy redirect-based flow).
    Validates the state parameter, then uses `YoutubeOAuthService.create_flow()`
    again to recreate the flow and exchange the authorization code for tokens via
    `flow.fetch_token()`. The obtained credentials are serialized using
    `YoutubeOAuthService.serialize_credentials()` and stored in the database.
    After successful authentication, fetches the user's YouTube channel information
    and redirects back to the frontend.

**`POST /youtube/auth/complete`**:
    Completes the OAuth flow from frontend callback. Accepts `code` and `state`
    in the request body, validates the state parameter, exchanges the authorization
    code for tokens, and stores credentials. After successful authentication,
    fetches the user's YouTube channel information and returns a JSON success
    response. This endpoint is used when the OAuth redirect URI points to the
    frontend application.

**`GET /youtube/auth/status`**:
    Checks the current authentication state. Uses `YoutubeOAuthService.deserialize_credentials()`
    to load stored credentials and determine if they are expired (indicating
    whether a refresh is needed).

**Credential refresh** (handled by `YoutubeService.build_authenticated_client()`):
    When building authenticated YouTube API clients, credentials are loaded via
    `deserialize_credentials()`, refreshed if expired using `refresh_credentials()`,
    and persisted back using `serialize_credentials()`.

References:
- Google OAuth 2.0: https://developers.google.com/identity/protocols/oauth2
- YouTube Data API: https://developers.google.com/youtube/v3/docs
- google-auth-oauthlib: https://google-auth-oauthlib.readthedocs.io/
"""

from __future__ import annotations

import secrets
from urllib.parse import urlsplit, urlunsplit
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from google.oauth2.credentials import Credentials
from pydantic import BaseModel

from app.dependencies import (
    get_user_service,
    get_youtube_oauth_service,
    get_youtube_oauth_service_optional,
    get_youtube_service,
)
from app.services.users import UserService
from app.services.youtube import YoutubeConfigurationError, YoutubeService
from app.services.youtube_oauth import YoutubeOAuthService

router = APIRouter(prefix="/youtube/auth", tags=["youtube"])


class CompleteAuthRequest(BaseModel):
    """Request body for completing OAuth flow."""

    code: str
    state: str


def _build_redirect_uri(request: Request, fallback: str) -> str:
    """Combine the incoming request host with the configured redirect path."""

    parsed_fallback = urlsplit(fallback)
    return urlunsplit(
        (
            request.url.scheme,
            request.url.netloc,
            parsed_fallback.path,
            parsed_fallback.query,
            parsed_fallback.fragment,
        )
    )


@router.post("/start")
def start_youtube_auth(
    request: Request,
    user_service: UserService = Depends(get_user_service),
    oauth_service: YoutubeOAuthService = Depends(get_youtube_oauth_service),
) -> dict[str, str]:
    """Generate a Google OAuth authorization URL for the frontend."""

    state = secrets.token_urlsafe(32)
    redirect_uri = _build_redirect_uri(request, oauth_service.redirect_uri)
    flow = oauth_service.create_flow(state=state, redirect_uri=redirect_uri)
    authorization_url, generated_state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    user_service.save_oauth_state(generated_state, datetime.now(tz=UTC))
    return {"authorizationUrl": authorization_url, "state": generated_state}


def _complete_oauth_flow(
    *,
    code: str,
    state: str,
    user_service: UserService,
    oauth_service: YoutubeOAuthService,
    youtube_service: YoutubeService,
    redirect_uri: str | None = None,
) -> dict[str, Any]:
    """Complete the OAuth flow by exchanging code for tokens and fetching channel info."""

    record = user_service.get_active_user()
    if record is None or record.oauth_state is None:
        raise HTTPException(status_code=400, detail="No OAuth state available")
    if state != record.oauth_state:
        raise HTTPException(status_code=400, detail="OAuth state mismatch")

    flow = oauth_service.create_flow(state=state, redirect_uri=redirect_uri)
    try:
        flow.fetch_token(code=code)
    except Exception as exc:  # pragma: no cover - passthrough for Google errors
        error_detail = str(exc)
        raise HTTPException(
            status_code=400,
            detail=f"Failed to exchange OAuth code: {error_detail}",
        ) from exc

    credentials = flow.credentials
    if not isinstance(credentials, Credentials):
        raise HTTPException(status_code=400, detail="Invalid credentials")

    serialized = oauth_service.serialize_credentials(credentials)
    user_service.upsert_credentials(serialized, datetime.now(tz=UTC))
    user_service.clear_oauth_state()

    try:
        youtube_client = youtube_service.build_authenticated_client(
            user_service, oauth_service
        )
    except YoutubeConfigurationError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    channel_payload = (
        youtube_client.channels()
        .list(part="snippet,contentDetails", mine=True)
        .execute()
    )
    channel_info = _extract_channel_payload(channel_payload)
    if channel_info is not None:
        user_service.update_channel_info(
            channel_id=channel_info["id"],
            channel_title=channel_info.get("title"),
            channel_url=channel_info.get("url"),
            thumbnail_url=channel_info.get("thumbnailUrl"),
            updated_at=datetime.now(tz=UTC),
        )

    return {"success": True}


@router.post("/complete")
def complete_youtube_auth_post(
    request_body: CompleteAuthRequest,
    user_service: UserService = Depends(get_user_service),
    oauth_service: YoutubeOAuthService = Depends(get_youtube_oauth_service),
    youtube_service: YoutubeService = Depends(get_youtube_service),
) -> dict[str, Any]:
    """Complete the OAuth flow from frontend callback, returning JSON response."""

    return _complete_oauth_flow(
        code=request_body.code,
        state=request_body.state,
        user_service=user_service,
        oauth_service=oauth_service,
        youtube_service=youtube_service,
    )


@router.get("/callback")
def complete_youtube_auth(
    request: Request,
    code: str = Query(..., min_length=1),
    state: str = Query(..., min_length=1),
    user_service: UserService = Depends(get_user_service),
    oauth_service: YoutubeOAuthService = Depends(get_youtube_oauth_service),
    youtube_service: YoutubeService = Depends(get_youtube_service),
) -> RedirectResponse:
    """Handle Google's OAuth callback (legacy redirect-based flow)."""

    _complete_oauth_flow(
        code=code,
        state=state,
        user_service=user_service,
        oauth_service=oauth_service,
        youtube_service=youtube_service,
        redirect_uri=_build_redirect_uri(request, oauth_service.redirect_uri),
    )

    settings = request.app.state.settings
    redirect_targets = settings.cors_origins
    redirect_url = request.headers.get("origin") or (
        redirect_targets[0] if redirect_targets else "/"
    )
    return RedirectResponse(url=redirect_url, status_code=302)


@router.get("/status")
def youtube_auth_status(
    user_service: UserService = Depends(get_user_service),
    oauth_service: YoutubeOAuthService | None = Depends(
        get_youtube_oauth_service_optional
    ),
) -> dict[str, Any]:
    """Return the stored authentication state for the active user."""

    # If OAuth is not configured, return not linked
    if oauth_service is None:
        return {
            "linked": False,
            "channel": None,
            "refreshNeeded": False,
            "statusMessage": None,
        }

    record = user_service.get_active_user()
    if record is None:
        return {
            "linked": False,
            "channel": None,
            "refreshNeeded": False,
            "statusMessage": None,
        }

    linked = bool(record.credentials_json)
    refresh_needed = False
    if record.credentials_json:
        try:
            credentials = oauth_service.deserialize_credentials(
                record.credentials_json
            )
        except ValueError:  # pragma: no cover - invalid stored payloads
            refresh_needed = True
        else:
            refresh_needed = credentials.expired

    channel = None
    if record.channel_id:
        channel = {
            "id": record.channel_id,
            "title": record.channel_title,
            "url": record.channel_url,
            "thumbnailUrl": record.channel_thumbnail_url,
            "updatedAt": record.channel_updated_at.isoformat()
            if record.channel_updated_at
            else None,
        }

    return {
        "linked": linked,
        "channel": channel,
        "refreshNeeded": refresh_needed,
        "statusMessage": record.credentials_error,
    }


@router.post("/unlink")
def unlink_youtube_account(
    user_service: UserService = Depends(get_user_service),
) -> dict[str, bool]:
    """Remove stored YouTube credentials and channel information."""

    user_service.upsert_credentials(None, None)
    user_service.clear_channel_info()
    user_service.clear_oauth_state()

    return {"success": True}


def _extract_channel_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Pull the relevant fields from a channels.list response."""

    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list) or not items:
        return None
    first = items[0]
    if not isinstance(first, dict):
        return None

    channel_id = first.get("id")
    if not isinstance(channel_id, str) or not channel_id:
        return None

    snippet = first.get("snippet")
    snippet_dict = snippet if isinstance(snippet, dict) else {}
    thumbnails = snippet_dict.get("thumbnails")
    thumbnail_url = _select_thumbnail(thumbnails)

    return {
        "id": channel_id,
        "title": snippet_dict.get("title"),
        "url": f"https://www.youtube.com/channel/{channel_id}",
        "thumbnailUrl": thumbnail_url,
    }


def _select_thumbnail(thumbnails: Any) -> str | None:
    """Pick a thumbnail URL from the snippet payload."""

    if not isinstance(thumbnails, dict):
        return None
    for key in ("high", "medium", "default"):
        candidate = thumbnails.get(key)
        if isinstance(candidate, dict):
            url = candidate.get("url")
            if isinstance(url, str) and url:
                return url
    return None
