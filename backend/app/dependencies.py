"""FastAPI dependency functions for service injection."""

from __future__ import annotations

from fastapi import Request

from app.services import EntryService, YoutubeService


def get_entry_service(request: Request) -> EntryService:
    """Extract EntryService from application state."""
    return request.app.state.entry_service


def get_youtube_service(request: Request) -> YoutubeService:
    """Extract YoutubeService from application state."""
    return request.app.state.youtube_service

