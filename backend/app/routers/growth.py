"""Endpoints for Storyloop growth score calculations."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field

from app.dependencies import (
    get_growth_score_service,
    get_user_service,
    get_youtube_analytics_service,
    get_youtube_oauth_service_optional,
    get_youtube_service,
)
from app.services.growth import GrowthScoreService
from app.services.sgi import ScoreComputation, ScoreComponentResult
from app.services.users import UserService
from app.services.youtube import YoutubeService
from app.services.youtube_analytics import YoutubeAnalyticsService
from app.services.youtube_oauth import YoutubeOAuthService

router = APIRouter(prefix="/growth", tags=["growth"])


class ScoreComponentModel(BaseModel):
    """API representation of an SGI component."""

    model_config = ConfigDict(populate_by_name=True)

    raw_value: float | None = Field(default=None, alias="rawValue")
    score: float
    weight: float


class ScoreBreakdownModel(BaseModel):
    """API representation of the SGI component breakdown."""

    model_config = ConfigDict(populate_by_name=True)

    discovery: ScoreComponentModel
    retention: ScoreComponentModel
    loyalty: ScoreComponentModel


class GrowthScoreResponse(BaseModel):
    """Payload returned when requesting the current growth score."""

    model_config = ConfigDict(populate_by_name=True)

    total_score: float = Field(alias="totalScore")
    score_delta: float = Field(alias="scoreDelta")
    updated_at: datetime = Field(alias="updatedAt")
    is_early_channel: bool = Field(alias="isEarlyChannel")
    breakdown: ScoreBreakdownModel


@router.get("/score", response_model=GrowthScoreResponse)
async def read_growth_score(
    channel_id: str | None = Query(default=None, alias="channelId"),
    video_type: str | None = Query(default=None, alias="videoType"),
    service: GrowthScoreService = Depends(get_growth_score_service),
    youtube_service: YoutubeService = Depends(get_youtube_service),
    analytics_service: YoutubeAnalyticsService = Depends(get_youtube_analytics_service),
    user_service: UserService = Depends(get_user_service),
    oauth_service: YoutubeOAuthService | None = Depends(get_youtube_oauth_service_optional),
) -> GrowthScoreResponse:
    """Return the Storyloop Growth Index for the requested channel.

    Args:
        channel_id: Optional channel identifier.
        video_type: Optional filter by video type ("short", "live", or "video").
    """
    computation = await service.load_latest_score(
        channel_id=channel_id,
        video_type=video_type,
        youtube_service=youtube_service,
        analytics_service=analytics_service,
        user_service=user_service,
        oauth_service=oauth_service,
    )
    return _serialize_score(computation)


def _serialize_score(computation: ScoreComputation) -> GrowthScoreResponse:
    breakdown = computation.breakdown
    return GrowthScoreResponse(
        totalScore=computation.total_score,
        scoreDelta=computation.score_delta,
        updatedAt=computation.updated_at,
        isEarlyChannel=computation.is_early_channel,
        breakdown=ScoreBreakdownModel(
            discovery=_serialize_component(breakdown.discovery),
            retention=_serialize_component(breakdown.retention),
            loyalty=_serialize_component(breakdown.loyalty),
        ),
    )


def _serialize_component(component: ScoreComponentResult) -> ScoreComponentModel:
    return ScoreComponentModel(
        rawValue=component.raw_value,
        score=component.score,
        weight=component.weight,
    )


__all__ = ["router"]
