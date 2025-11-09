"""Storyloop Growth Index (SGI) calculations.

This module implements the Storyloop Growth Index, a CTR-free Expected Satisfied Watch Time
per Impression (eSWTPI) metric designed to help creators track their growth progress across
every upload. The SGI combines three normalized components:

- **Discovery (40%)**: Measures how quickly a video reaches an audience using View Velocity
  over 7 days as a proxy for discovery strength and topic resonance.
- **Retention (45%)**: Measures how deeply viewers watch and stay engaged, combining Average
  View Percentage (AVP) and Early Hook Score (EHS) weighted at 60% and 40% respectively.
- **Loyalty (15%)**: Tracks conversion of viewers into recurring fans via Subscribers per
  1K Views (SPV).

For detailed explanations of the scoring methodology, component formulas, normalization
strategies, and design rationale, see:
- `thinking/insights.md` - Complete scoring logic and component breakdown
- `thinking/architecture.md` - System architecture overview
- `thinking/story.md` - Product narrative and user experience context

The module normalizes each component using z-scores against the creator's rolling baseline
(typically the last N videos), with special handling for early channels (< 5 videos) that
use absolute retention scores normalized against YouTube's platform baseline rather than
the channel's own history.
"""

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
    """Input metrics required to calculate SGI for a single video.
    
    All metrics are sourced from YouTube Analytics API. See `thinking/insights.md` for
    detailed explanations of how each metric is used in the SGI calculation.
    
    Attributes:
        video_id: Unique YouTube video identifier.
        view_velocity_7d: Sum of views from days 0-6 after publish. Used for Discovery
            component. None if unavailable.
        average_view_percentage: Average percentage of video watched (0.0-1.0 scale).
            Used in Retention calculation. None if unavailable.
        early_hook_score: YouTube's relativeRetentionPerformance metric (0-100 scale),
            normalized against similar-length videos. Used in Retention calculation.
            None if unavailable.
        subscribers_gained: Net subscribers gained from this video. Used for Loyalty
            calculation. None if unavailable.
        subscribers_lost: Net subscribers lost from this video. Used for Loyalty
            calculation. None if unavailable.
        views_28d: Total views over 28 days after publish. Used as denominator for
            SPV calculation. None if unavailable.
    """

    video_id: str
    view_velocity_7d: float | None
    average_view_percentage: float | None
    early_hook_score: float | None
    subscribers_gained: int | None
    subscribers_lost: int | None
    views_28d: int | None


@dataclass(slots=True)
class ComponentStats:
    """Mean and standard deviation for a score component.
    
    Used to compute z-scores for normalization against the channel's baseline history.
    See `thinking/insights.md` for details on how z-scores are used in component scoring.
    """

    mean: float
    std_dev: float


@dataclass(slots=True)
class ScoreComponentResult:
    """Normalized score for a component along with the raw value.
    
    The score is normalized to a 0-100 range for presentation, while raw_value preserves
    the original metric for reference and debugging. See `thinking/insights.md` for
    normalization strategies used for each component.
    """

    raw_value: float | None
    score: float
    weight: float


@dataclass(slots=True)
class ScoreBreakdown:
    """Breakdown of Storyloop Growth Index components.
    
    Provides visibility into how each component (Discovery, Retention, Loyalty) contributes
    to the total SGI score. Used in UI to display component-level insights to creators.
    See `thinking/insights.md` for component weight explanations.
    """

    discovery: ScoreComponentResult
    retention: ScoreComponentResult
    loyalty: ScoreComponentResult


@dataclass(slots=True)
class ScoreComputation:
    """Aggregate Storyloop Growth Index calculation.
    
    Contains the final SGI score (0-100), delta from baseline average, timestamp, and
    component breakdown. The score_delta helps creators understand whether their latest
    upload performed above or below their recent average.
    """

    total_score: float
    score_delta: float
    updated_at: datetime
    is_early_channel: bool
    breakdown: ScoreBreakdown


def compute_growth_score(
    current: VideoScoreInputs,
    baseline: Sequence[VideoScoreInputs],
) -> ScoreComputation:
    """Compute the Storyloop Growth Index for the latest upload.
    
    Calculates the SGI by normalizing Discovery, Retention, and Loyalty components
    against the channel's baseline history, then combining them with weighted averaging.
    
    For early channels (< 5 videos), retention uses absolute scoring normalized against
    YouTube's platform baseline (via relativeRetentionPerformance) rather than z-scoring
    against the channel's own history. This provides meaningful feedback even with limited
    historical data.
    
    Args:
        current: Metrics for the video being scored (typically the latest upload).
        baseline: Historical video metrics used to compute normalization statistics.
            Typically the last N videos before the current one.
    
    Returns:
        ScoreComputation containing the total SGI score, delta from baseline average,
        component breakdown, and metadata.
    
    See Also:
        `thinking/insights.md` - Complete scoring formula and component explanations.
    """

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
    """Calculate mean and standard deviation for a component metric across baseline videos.
    
    Used to compute z-scores for normalization. Returns None if no valid values are found
    in the baseline. For single-value baselines, returns stats with std_dev=0.0.
    
    Args:
        baseline: Historical video metrics to analyze.
        extractor: Function that extracts the component metric from a VideoScoreInputs.
    
    Returns:
        ComponentStats with mean and std_dev, or None if no valid values found.
    """
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
    """Calculate raw retention score combining AVP and Early Hook Score.
    
    Combines Average View Percentage (60% weight) and Early Hook Score (40% weight).
    EHS uses YouTube's relativeRetentionPerformance, which is already normalized against
    similar-length videos on the platform.
    
    Returns None if both AVP and EHS are unavailable. If only one is available, returns
    that value (with AVP converted to percentage scale if needed).
    
    Args:
        video: Video metrics to calculate retention for.
    
    Returns:
        Raw retention score (0-100 scale), or None if insufficient data.
    
    See Also:
        `thinking/insights.md` - Retention component formula and rationale.
    """
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
    """Calculate Subscribers per 1K Views (SPV) for loyalty component.
    
    SPV = (subscribers_gained - subscribers_lost) / views_28d * 1000
    
    This metric measures how effectively a video converts viewers into recurring fans.
    Higher SPV indicates stronger audience loyalty and conversion.
    
    Args:
        video: Video metrics to calculate SPV for.
    
    Returns:
        SPV value (subscribers per 1000 views), or None if required metrics unavailable.
    
    See Also:
        `thinking/insights.md` - Loyalty component formula and purpose.
    """
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
    """Normalize discovery (View Velocity 7d) to 0-100 score.
    
    Uses z-score normalization against baseline when statistics are available. Falls back
    to approximation using a proxy z-score based on typical view velocity ranges when
    baseline stats are unavailable (e.g., first video on channel).
    
    Args:
        raw_value: View Velocity 7d (sum of views days 0-6).
        stats: Baseline statistics for normalization, or None if unavailable.
    
    Returns:
        Normalized discovery score (0-100).
    """
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
    """Normalize retention score to 0-100 range.
    
    For early channels (< 5 videos), uses absolute scoring clamped to 0-100, since
    YouTube's relativeRetentionPerformance already provides platform-normalized baseline.
    For established channels, uses z-score normalization against channel history.
    
    Args:
        raw_value: Combined retention score (0.6 * AVP + 0.4 * EHS).
        stats: Baseline statistics for normalization, or None if unavailable.
        is_early_channel: True if channel has < 5 videos total.
    
    Returns:
        Normalized retention score (0-100).
    
    See Also:
        `thinking/insights.md` - Early channel handling rationale.
    """
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
    """Normalize loyalty (SPV) to 0-100 score.
    
    Uses z-score normalization against baseline when statistics are available. Falls back
    to approximation using a proxy z-score based on typical SPV ranges when baseline
    stats are unavailable.
    
    Args:
        raw_value: Subscribers per 1K Views (SPV).
        stats: Baseline statistics for normalization, or None if unavailable.
    
    Returns:
        Normalized loyalty score (0-100).
    """
    if raw_value is None:
        return 0.0
    if stats and stats.std_dev > 0:
        z_score = (raw_value - stats.mean) / stats.std_dev
        return _normalize_to_0_100(z_score)
    return _approximate_loyalty(raw_value)


def _approximate_discovery(raw_value: float) -> float:
    """Approximate discovery score when baseline statistics unavailable.
    
    Uses a proxy z-score based on typical view velocity ranges, assuming 10K views
    as a reference point. Used for first video or when baseline is insufficient.
    
    Args:
        raw_value: View Velocity 7d.
    
    Returns:
        Approximated discovery score (0-100).
    """
    if raw_value <= 0:
        return 0.0
    proxy_z = (raw_value / 10000.0 - 1.0) / 2.0
    return _normalize_to_0_100(proxy_z)


def _approximate_loyalty(raw_value: float) -> float:
    """Approximate loyalty score when baseline statistics unavailable.
    
    Uses a proxy z-score assuming 7.5 SPV as mean and 5.0 as standard deviation.
    Used for first video or when baseline is insufficient.
    
    Args:
        raw_value: Subscribers per 1K Views (SPV).
    
    Returns:
        Approximated loyalty score (0-100).
    """
    proxy_z = (raw_value - 7.5) / 5.0
    return _normalize_to_0_100(proxy_z)


def _normalize_to_0_100(z_score: float, *, min_z: float = -3.0, max_z: float = 3.0) -> float:
    """Convert z-score to 0-100 normalized score.
    
    Clamps z-score to [min_z, max_z] range, then linearly maps to [0, 100]. This ensures
    extreme outliers don't dominate the score while preserving relative differences.
    
    Args:
        z_score: Standardized score (number of standard deviations from mean).
        min_z: Minimum z-score to consider (default -3.0, i.e., 3σ below mean).
        max_z: Maximum z-score to consider (default 3.0, i.e., 3σ above mean).
    
    Returns:
        Normalized score clamped to [0, 100].
    """
    clamped = _clamp(z_score, min_z, max_z)
    normalized = (clamped - min_z) / (max_z - min_z) * 100
    return _clamp(normalized, 0.0, 100.0)


def _weighted_total(
    discovery_score: float, retention_score: float, loyalty_score: float
) -> float:
    """Calculate weighted sum of component scores.
    
    Combines Discovery (40%), Retention (45%), and Loyalty (15%) into final SGI.
    Weights reflect the relative importance of each component in measuring creator growth.
    
    Args:
        discovery_score: Normalized discovery component (0-100).
        retention_score: Normalized retention component (0-100).
        loyalty_score: Normalized loyalty component (0-100).
    
    Returns:
        Weighted total SGI score (0-100).
    
    See Also:
        `thinking/insights.md` - Component weight rationale and formula.
    """
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
    """Calculate total SGI scores for all baseline videos.
    
    Used to compute the average baseline score for delta calculation. Each baseline video
    is scored using the same normalization statistics as the current video to ensure
    fair comparison.
    
    Args:
        baseline: Historical video metrics to score.
        discovery_stats: Statistics for discovery normalization.
        retention_stats: Statistics for retention normalization.
        loyalty_stats: Statistics for loyalty normalization.
        is_early_channel: True if channel has < 5 videos total.
    
    Returns:
        List of total SGI scores for each baseline video.
    """
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
