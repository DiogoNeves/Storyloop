"""FastAPI dependency functions for service injection."""

from __future__ import annotations

from collections.abc import Iterator

import sqlite3

from fastapi import HTTPException, Request

from app.services import (
    DictationService,
    EntryService,
    GrowthScoreService,
    UserService,
    YoutubeOAuthService,
    YoutubeService,
)
from app.services.assets import AssetService
from app.services.youtube_analytics import YoutubeAnalyticsService
from app.services.youtube_demo import (
    DemoUserService,
    DemoYoutubeOAuthService,
)


def get_entry_service(request: Request) -> EntryService:
    """Extract EntryService from application state."""
    return request.app.state.entry_service


def get_asset_service(request: Request) -> AssetService:
    """Extract AssetService from application state."""
    return request.app.state.asset_service


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


def get_growth_score_service(request: Request) -> GrowthScoreService:
    """Extract GrowthScoreService from application state."""
    service = getattr(request.app.state, "growth_score_service", None)
    if service is None:
        service = GrowthScoreService()
        request.app.state.growth_score_service = service
    return service


def get_dictation_service(request: Request) -> DictationService:
    """Extract DictationService from application state."""
    service = getattr(request.app.state, "dictation_service", None)
    if service is None:
        settings = request.app.state.settings
        service = DictationService(settings)
        request.app.state.dictation_service = service
    return service


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
