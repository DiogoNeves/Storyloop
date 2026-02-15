"""FastAPI dependency functions for service injection."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass

import sqlite3

from fastapi import Depends, HTTPException, Request

from app.services import (
    EntryService,
    SpeechToTextService,
    UserService,
    YoutubeOAuthService,
    YoutubeService,
)
from app.services.assets import AssetService
from app.services.smart_entries import SmartEntryUpdateManager
from app.services.youtube_analytics import YoutubeAnalyticsService
from app.services.youtube_demo import (
    DemoUserService,
    DemoYoutubeOAuthService,
)


def get_entry_service(request: Request) -> EntryService:
    """Extract EntryService from application state."""
    return request.app.state.entry_service


def get_smart_entry_manager(request: Request) -> SmartEntryUpdateManager:
    """Extract SmartEntryUpdateManager from application state."""
    manager = getattr(request.app.state, "smart_entry_manager", None)
    if manager is None:
        raise HTTPException(
            status_code=503,
            detail="Smart entry updates are not configured",
        )
    return manager


def get_asset_service(request: Request) -> AssetService:
    """Extract AssetService from application state."""
    return request.app.state.asset_service


def get_speech_to_text_service(request: Request) -> SpeechToTextService:
    """Extract SpeechToTextService from application state."""

    service = getattr(request.app.state, "speech_to_text_service", None)
    if service is None:
        raise HTTPException(
            status_code=503,
            detail="Speech-to-text service is not configured",
        )
    return service


def get_youtube_service(request: Request) -> YoutubeService:
    """Extract YoutubeService from application state."""
    return request.app.state.youtube_service


def get_user_service(request: Request) -> UserService:
    """Extract UserService from application state.

    In demo mode, returns DemoUserService wrapping the real service.
    """
    real_service = request.app.state.user_service
    demo_mode = getattr(request.app.state, "youtube_demo_mode", False)
    if demo_mode:
        return DemoUserService(real_service)
    return real_service


def get_youtube_oauth_service(request: Request) -> YoutubeOAuthService:
    """Extract YoutubeOAuthService from application state.

    In demo mode, returns DemoYoutubeOAuthService.
    """
    demo_mode = getattr(request.app.state, "youtube_demo_mode", False)
    if demo_mode:
        return DemoYoutubeOAuthService()
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
    """Extract YoutubeOAuthService from application state, returning None if not configured.

    In demo mode, always returns DemoYoutubeOAuthService.
    """
    demo_mode = getattr(request.app.state, "youtube_demo_mode", False)
    if demo_mode:
        return DemoYoutubeOAuthService()
    return request.app.state.youtube_oauth_service


def get_youtube_demo_mode(request: Request) -> bool:
    """Extract YouTube demo mode status from application state."""
    return getattr(request.app.state, "youtube_demo_mode", False)


def get_youtube_analytics_service(request: Request) -> YoutubeAnalyticsService:
    """Extract YoutubeAnalyticsService from application state."""
    service = getattr(request.app.state, "youtube_analytics_service", None)
    if service is None:
        raise HTTPException(
            status_code=503,
            detail="YouTube Analytics service not configured",
        )
    return service


def get_db(request: Request) -> Iterator[sqlite3.Connection]:
    """Extract SQLite connection factory from application state and yield a connection.

    The connection is automatically closed after the request completes.
    """
    get_db_factory = request.app.state.get_db
    connection = get_db_factory()
    try:
        yield connection
    finally:
        connection.close()


@dataclass
class YoutubeAuthDeps:
    """Composite dependency for YouTube services with optional OAuth.

    Groups the commonly-used trio of YouTube-related services for endpoints
    that support both authenticated and API key-based requests.
    """

    youtube_service: YoutubeService
    user_service: UserService
    oauth_service: YoutubeOAuthService | None


def get_youtube_auth_deps(
    youtube_service: YoutubeService = Depends(get_youtube_service),
    user_service: UserService = Depends(get_user_service),
    oauth_service: YoutubeOAuthService | None = Depends(
        get_youtube_oauth_service_optional
    ),
) -> YoutubeAuthDeps:
    """Get all YouTube auth-related services as a single composite dependency.

    Use this when an endpoint needs youtube_service, user_service, and
    oauth_service together.
    """
    return YoutubeAuthDeps(
        youtube_service=youtube_service,
        user_service=user_service,
        oauth_service=oauth_service,
    )
