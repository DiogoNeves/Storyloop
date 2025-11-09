"""Endpoints for Storyloop growth score calculations."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field

from app.dependencies import get_growth_score_service
from app.services.growth import GrowthScoreService
from app.services.sgi import ScoreComputation, ScoreComponentResult

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
def read_growth_score(
    channel_id: str | None = Query(default=None, alias="channelId"),
    service: GrowthScoreService = Depends(get_growth_score_service),
) -> GrowthScoreResponse:
    """Return the Storyloop Growth Index for the requested channel."""

    computation = service.load_latest_score(channel_id=channel_id)
    return _serialize_score(computation)


def _serialize_score(computation: ScoreComputation) -> GrowthScoreResponse:
    breakdown = computation.breakdown
    return GrowthScoreResponse(
        total_score=computation.total_score,
        score_delta=computation.score_delta,
        updated_at=computation.updated_at,
        is_early_channel=computation.is_early_channel,
        breakdown=ScoreBreakdownModel(
            discovery=_serialize_component(breakdown.discovery),
            retention=_serialize_component(breakdown.retention),
            loyalty=_serialize_component(breakdown.loyalty),
        ),
    )


def _serialize_component(component: ScoreComponentResult) -> ScoreComponentModel:
    return ScoreComponentModel(
        raw_value=component.raw_value,
        score=component.score,
        weight=component.weight,
    )


__all__ = ["router"]
