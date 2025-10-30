"""Shared error handling utilities for router endpoints."""

from __future__ import annotations

from typing import TypeVar

from fastapi import HTTPException, status

from app.services.youtube import (
    YoutubeAPIRequestError,
    YoutubeChannelNotFound,
    YoutubeConfigurationError,
    YoutubeError,
)

T = TypeVar("T")


def handle_youtube_error(exc: YoutubeError) -> HTTPException:
    """Map YouTube service exceptions to HTTPException.
    
    This is a pure function that converts domain exceptions to HTTP responses.
    """
    if isinstance(exc, YoutubeConfigurationError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )
    if isinstance(exc, YoutubeChannelNotFound):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    if isinstance(exc, YoutubeAPIRequestError):
        return HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        )
    # Fallback for unknown YoutubeError subclasses
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=str(exc),
    )


def ensure_exists(value: T | None, entity_name: str = "Resource") -> T:
    """Return the value if not None, otherwise raise 404 HTTPException.
    
    This is a pure function for the common "not found" pattern.
    
    Args:
        value: The value to check
        entity_name: Name of the entity for error messages
        
    Returns:
        The value if not None
        
    Raises:
        HTTPException: 404 if value is None
    """
    if value is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{entity_name} not found",
        )
    return value

