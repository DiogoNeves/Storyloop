"""Endpoints for ChatKit session management and demo tools."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.dependencies import get_chatkit_service, get_user_service
from app.services import ChatkitService, UserService
from app.services.chatkit import ChatkitError


router = APIRouter(tags=["chatkit"])


class ChatkitSessionResponse(BaseModel):
    """Serialized ChatKit session response."""

    model_config = ConfigDict(populate_by_name=True)

    client_secret: str = Field(alias="clientSecret")
    session_id: str | None = Field(default=None, alias="sessionId")


@router.post("/chatkit/session", response_model=ChatkitSessionResponse)
async def create_chatkit_session(
    chatkit_service: ChatkitService = Depends(get_chatkit_service),
    user_service: UserService = Depends(get_user_service),
) -> ChatkitSessionResponse:
    """Create a ChatKit session for the current Storyloop user."""

    user = user_service.get_active_user()
    user_id = user.id if user else "guest"

    try:
        session = await chatkit_service.create_session(user_id=user_id)
    except ChatkitError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return ChatkitSessionResponse(
        client_secret=session.client_secret,
        session_id=session.session_id,
    )


class YoutubeMetricsRequest(BaseModel):
    """Request payload for the demo YouTube metrics tool."""

    videoIds: list[str] = Field(default_factory=list)


class YoutubeMetricsResponse(BaseModel):
    """Simplified metrics payload consumed by the agent demo."""

    ok: bool
    data: list[dict[str, Any]]


@router.post("/tools/youtube_get_metrics", response_model=YoutubeMetricsResponse)
async def youtube_get_metrics(
    payload: YoutubeMetricsRequest,
    user_service: UserService = Depends(get_user_service),
) -> YoutubeMetricsResponse:
    """Return placeholder metrics for the requested videos.

    The endpoint is intentionally lightweight to unblock frontend integration while
    the full YouTube analytics workflow is implemented.
    """

    user = user_service.get_active_user()
    channel_name = user.channel_title if user else "Your channel"

    demo_metrics: list[dict[str, Any]] = []
    for index, video_id in enumerate(payload.videoIds or ["demo"], start=1):
        demo_metrics.append(
            {
                "videoId": video_id,
                "title": f"Sample video #{index}",
                "channel": channel_name,
                "views": 12_345 + index * 321,
                "clickThroughRate": 6.2 + index * 0.3,
                "averageViewDurationSeconds": 265 + index * 12,
            }
        )

    return YoutubeMetricsResponse(ok=True, data=demo_metrics)

