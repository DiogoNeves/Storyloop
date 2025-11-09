"""Storyloop Growth Index calculations."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from math import sqrt
from typing import Callable, Iterable, Sequence

DISCOVERY_WEIGHT = 0.40
RETENTION_WEIGHT = 0.45
LOYALTY_WEIGHT = 0.15


@dataclass(slots=True)
class VideoScoreInputs:
    """Input metrics required to calculate SGI for a single video."""

    video_id: str
    view_velocity_7d: float | None
    average_view_percentage: float | None
    early_hook_score: float | None
    subscribers_gained: int | None
    subscribers_lost: int | None
    views_28d: int | None


@dataclass(slots=True)
class ComponentStats:
    """Mean and standard deviation for a score component."""

    mean: float
    std_dev: float


@dataclass(slots=True)
class ScoreComponentResult:
    """Normalized score for a component along with the raw value."""

    raw_value: float | None
    score: float
    weight: float


@dataclass(slots=True)
class ScoreBreakdown:
    """Breakdown of Storyloop Growth Index components."""

    discovery: ScoreComponentResult
    retention: ScoreComponentResult
    loyalty: ScoreComponentResult


@dataclass(slots=True)
class ScoreComputation:
    """Aggregate Storyloop Growth Index calculation."""

    total_score: float
    score_delta: float
    updated_at: datetime
    is_early_channel: bool
    breakdown: ScoreBreakdown


def compute_growth_score(
    current: VideoScoreInputs,
    baseline: Sequence[VideoScoreInputs],
) -> ScoreComputation:
    """Compute the Storyloop Growth Index for the latest upload."""

    discovery_stats = _component_stats(
        baseline, lambda video: video.view_velocity_7d
    )
    retention_stats = _component_stats(
        baseline, _calculate_retention_raw
    )
    loyalty_stats = _component_stats(baseline, _calculate_spv)

    total_videos = len(baseline) + 1
    is_early_channel = total_videos < 5

    discovery_raw = current.view_velocity_7d
    retention_raw = _calculate_retention_raw(current)
    loyalty_raw = _calculate_spv(current)

    discovery_score = _score_discovery(discovery_raw, discovery_stats)
    retention_score = _score_retention(
        retention_raw, retention_stats, is_early_channel
    )
    loyalty_score = _score_loyalty(loyalty_raw, loyalty_stats)

    total_score = _weighted_total(
        discovery_score, retention_score, loyalty_score
    )
    baseline_totals = _baseline_totals(
        baseline,
        discovery_stats,
        retention_stats,
        loyalty_stats,
        is_early_channel,
    )
    baseline_average = sum(baseline_totals) / len(baseline_totals) if baseline_totals else 0.0
    score_delta = total_score - baseline_average

    breakdown = ScoreBreakdown(
        discovery=ScoreComponentResult(
            raw_value=discovery_raw,
            score=_round_one(discovery_score),
            weight=DISCOVERY_WEIGHT,
        ),
        retention=ScoreComponentResult(
            raw_value=_round_two(retention_raw),
            score=_round_one(retention_score),
            weight=RETENTION_WEIGHT,
        ),
        loyalty=ScoreComponentResult(
            raw_value=_round_two(loyalty_raw),
            score=_round_one(loyalty_score),
            weight=LOYALTY_WEIGHT,
        ),
    )

    return ScoreComputation(
        total_score=_round_one(total_score),
        score_delta=_round_one(score_delta),
        updated_at=datetime.now(tz=UTC),
        is_early_channel=is_early_channel,
        breakdown=breakdown,
    )


def _component_stats(
    baseline: Sequence[VideoScoreInputs], extractor: Callable[[VideoScoreInputs], float | None]
) -> ComponentStats | None:
    values = [extractor(video) for video in baseline]
    filtered = [value for value in values if value is not None]
    if not filtered:
        return None
    if len(filtered) == 1:
        return ComponentStats(mean=filtered[0], std_dev=0.0)
    mean = sum(filtered) / len(filtered)
    variance = sum((value - mean) ** 2 for value in filtered) / (len(filtered) - 1)
    std_dev = sqrt(variance) if variance > 0 else 0.0
    return ComponentStats(mean=mean, std_dev=std_dev)


def _calculate_retention_raw(video: VideoScoreInputs) -> float | None:
    avp = video.average_view_percentage
    ehs = video.early_hook_score
    if avp is None and ehs is None:
        return None
    avp_percent = avp * 100 if avp is not None else None
    if avp_percent is not None and ehs is not None:
        return 0.6 * avp_percent + 0.4 * ehs
    if avp_percent is not None:
        return 0.6 * avp_percent
    if ehs is not None:
        return float(ehs)
    return None


def _calculate_spv(video: VideoScoreInputs) -> float | None:
    views_28d = video.views_28d
    subs_gained = video.subscribers_gained
    subs_lost = video.subscribers_lost
    if (
        views_28d is None
        or views_28d <= 0
        or subs_gained is None
        or subs_lost is None
    ):
        return None
    net_subs = subs_gained - subs_lost
    return (net_subs / views_28d) * 1000


def _score_discovery(
    raw_value: float | None, stats: ComponentStats | None
) -> float:
    if raw_value is None:
        return 0.0
    if stats and stats.std_dev > 0:
        z_score = (raw_value - stats.mean) / stats.std_dev
        return _normalize_to_0_100(z_score)
    return _approximate_discovery(raw_value)


def _score_retention(
    raw_value: float | None,
    stats: ComponentStats | None,
    is_early_channel: bool,
) -> float:
    if raw_value is None:
        return 0.0
    if is_early_channel:
        return _clamp(raw_value, 0.0, 100.0)
    if stats and stats.std_dev > 0:
        z_score = (raw_value - stats.mean) / stats.std_dev
        return _normalize_to_0_100(z_score, min_z=-2.5, max_z=2.5)
    return _clamp(raw_value, 0.0, 100.0)


def _score_loyalty(
    raw_value: float | None, stats: ComponentStats | None
) -> float:
    if raw_value is None:
        return 0.0
    if stats and stats.std_dev > 0:
        z_score = (raw_value - stats.mean) / stats.std_dev
        return _normalize_to_0_100(z_score)
    return _approximate_loyalty(raw_value)


def _approximate_discovery(raw_value: float) -> float:
    if raw_value <= 0:
        return 0.0
    proxy_z = (raw_value / 10000.0 - 1.0) / 2.0
    return _normalize_to_0_100(proxy_z)


def _approximate_loyalty(raw_value: float) -> float:
    proxy_z = (raw_value - 7.5) / 5.0
    return _normalize_to_0_100(proxy_z)


def _normalize_to_0_100(z_score: float, *, min_z: float = -3.0, max_z: float = 3.0) -> float:
    clamped = _clamp(z_score, min_z, max_z)
    normalized = (clamped - min_z) / (max_z - min_z) * 100
    return _clamp(normalized, 0.0, 100.0)


def _weighted_total(
    discovery_score: float, retention_score: float, loyalty_score: float
) -> float:
    return (
        discovery_score * DISCOVERY_WEIGHT
        + retention_score * RETENTION_WEIGHT
        + loyalty_score * LOYALTY_WEIGHT
    )


def _baseline_totals(
    baseline: Iterable[VideoScoreInputs],
    discovery_stats: ComponentStats | None,
    retention_stats: ComponentStats | None,
    loyalty_stats: ComponentStats | None,
    is_early_channel: bool,
) -> list[float]:
    totals: list[float] = []
    for video in baseline:
        discovery_raw = video.view_velocity_7d
        retention_raw = _calculate_retention_raw(video)
        loyalty_raw = _calculate_spv(video)
        discovery_score = _score_discovery(discovery_raw, discovery_stats)
        retention_score = _score_retention(
            retention_raw, retention_stats, is_early_channel
        )
        loyalty_score = _score_loyalty(loyalty_raw, loyalty_stats)
        totals.append(
            _weighted_total(discovery_score, retention_score, loyalty_score)
        )
    return totals


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _round_one(value: float) -> float:
    return round(value, 1)


def _round_two(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value, 2)


__all__ = [
    "ComponentStats",
    "ScoreBreakdown",
    "ScoreComponentResult",
    "ScoreComputation",
    "VideoScoreInputs",
    "compute_growth_score",
]
