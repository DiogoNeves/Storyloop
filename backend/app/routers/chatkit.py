"""HTTP endpoints for ChatKit integration.

This module provides endpoints for creating ChatKit sessions and handling
tool invocations from the ChatKit agent.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.dependencies import get_user_service
from app.services.chatkit import ChatKitConfigurationError, ChatKitService
from app.services.users import UserService

router = APIRouter(prefix="/chatkit", tags=["chatkit"])


class SessionResponse(BaseModel):
    """Response model for ChatKit session creation."""

    client_secret: str
    session_id: str | None = None


class ToolRequest(BaseModel):
    """Request model for tool invocations."""

    video_ids: list[str]


class ToolResponse(BaseModel):
    """Response model for tool invocations."""

    ok: bool
    data: dict[str, Any]


def get_chatkit_service(request: Request) -> ChatKitService:
    """Extract ChatKitService from application state."""
    service = getattr(request.app.state, "chatkit_service", None)
    if service is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "ChatKit is not configured. Please set OPENAI_API_KEY"
                " environment variable."
            ),
        )
    return service


@router.post("/session", response_model=SessionResponse)
def create_chatkit_session(
    user_service: UserService = Depends(get_user_service),
    chatkit_service: ChatKitService = Depends(get_chatkit_service),
) -> SessionResponse:
    """Create a new ChatKit session for the authenticated user.

    Returns a short-lived client secret that the frontend can use to
    initialize the ChatKit widget.
    """
    record = user_service.get_active_user()
    if record is None:
        raise HTTPException(
            status_code=401, detail="User not found. Please authenticate first."
        )

    try:
        session_data = chatkit_service.create_session(user_id=record.id)
        return SessionResponse(
            client_secret=session_data["client_secret"],
            session_id=session_data.get("session_id"),
        )
    except ChatKitConfigurationError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/tools/youtube_get_metrics", response_model=ToolResponse)
def youtube_get_metrics(
    request_body: ToolRequest,
    user_service: UserService = Depends(get_user_service),
) -> ToolResponse:
    """Handle YouTube metrics tool invocation from ChatKit.

    This is a placeholder implementation that returns mock data.
    In a full implementation, this would:
    1. Verify the user's session
    2. Load and refresh Google tokens from the database
    3. Call the YouTube Analytics API
    4. Return normalized metrics data
    """
    record = user_service.get_active_user()
    if record is None:
        raise HTTPException(
            status_code=401, detail="User not found. Please authenticate first."
        )

    # Placeholder: return mock metrics data
    # In production, this would fetch real metrics from YouTube Analytics API
    mock_data = {
        "videos": [
            {
                "video_id": video_id,
                "views": 1000,
                "likes": 50,
                "comments": 10,
                "watch_time_minutes": 500,
            }
            for video_id in request_body.video_ids
        ]
    }

    return ToolResponse(ok=True, data=mock_data)

