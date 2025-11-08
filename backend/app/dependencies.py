"""FastAPI dependency functions for service injection."""

from __future__ import annotations

from fastapi import HTTPException, Request

from app.services import (
    EntryService,
    UserService,
    YoutubeOAuthService,
    YoutubeService,
)


def get_entry_service(request: Request) -> EntryService:
    """Extract EntryService from application state."""
    return request.app.state.entry_service


def get_youtube_service(request: Request) -> YoutubeService:
    """Extract YoutubeService from application state."""
    return request.app.state.youtube_service


def get_user_service(request: Request) -> UserService:
    """Extract UserService from application state."""
    return request.app.state.user_service


def get_youtube_oauth_service(request: Request) -> YoutubeOAuthService:
    """Extract YoutubeOAuthService from application state."""
    oauth_service = request.app.state.youtube_oauth_service
    if oauth_service is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "YouTube OAuth is not configured. Please set"
                " YOUTUBE_OAUTH_CLIENT_ID, YOUTUBE_OAUTH_CLIENT_SECRET,"
                " and YOUTUBE_REDIRECT_URI environment variables."
            ),
        )
    return oauth_service


def get_youtube_oauth_service_optional(
    request: Request,
) -> YoutubeOAuthService | None:
    """Extract YoutubeOAuthService from application state, returning None if not configured."""
    return request.app.state.youtube_oauth_service
