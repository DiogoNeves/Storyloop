# Insights & Growth Calculations

## Overview
Storyloop centers on a single, interpretable metric that lets creators track the progress of their craft across every upload. The current implementation focuses on the CTR-free Expected Satisfied Watch Time per Impression (eSWTPI), tuned for long-term comparability and resilient to algorithm-driven cycles. Expected Satisfied Watch Time per Impression reflects how much valuable viewing time each upload generates for every opportunity to be discovered.

## Why CTR Isn’t Included
The ideal formulation would incorporate ImpressionClickThroughRate (CTR) to directly measure discovery quality, but YouTube’s public APIs do not expose CTR in a reliable or policy-compliant manner. CTR reflects how enticing thumbnails and titles are and has an outsized impact on initial discovery. In its absence, Storyloop uses View Velocity as an API-accessible proxy. As a result, eSWTPI emphasizes retention and engagement—the aspects of performance creators can fully control.

## Score Formula (CTR-free eSWTPI)
Storyloop implements the CTR-free eSWTPI as the **Storyloop Growth Index (SGI)**:

```
eSWTPI (SGI) = 0.40 * Discovery + 0.45 * RetentionQuality + 0.15 * Loyalty
```

Each component is normalized (z-score) against the creator’s rolling baseline (e.g., the last *N* videos) and scaled to a 0–100 range for presentation.

## Detailed Component Formulas

### 🧭 Discovery (40%)
**Purpose:** Capture how quickly the video reaches an audience as a proxy for discovery strength and topic resonance.

- **Metric:** View Velocity 7d (VV7)

```
VV7 = Σ views(day 0..6 after publish)
Discovery = z(VV7)
```

Use the channel’s past *N* uploads for the z-score baseline. Optionally expose a rolling seven-day window per upload to help contextualize spikes or dips.

### 🎬 RetentionQuality (45%)
**Purpose:** Measure how deeply viewers watch and stay engaged.

- **Average View Percentage (AVP):**

```
AVP = averageViewPercentage / 100
```

- **Early Hook Score (EHS):** Based on relativeRetentionPerformance across the early sections of the video.

```
EHS = 0.5 * RRP@3% + 0.3 * RRP@10% + 0.2 * RRP@30%
```

- **Combined RetentionQuality:**

```
RetentionQuality = z(0.6 * AVP + 0.4 * EHS)
```

High AVP signals overall content strength, while EHS highlights the effectiveness of the opening hook.

### 💡 Loyalty (15%)
**Purpose:** Track the conversion of viewers into recurring fans.

- **Metric:** Subscribers per 1K Views (SPV)

```
SPV = (subsGained - subsLost) / views_28d * 1000
Loyalty = z(SPV)
```

## Aggregation

```
SGI_raw = 0.40 * z(VV7) + 0.45 * z(RetentionQuality) + 0.15 * z(SPV)
SGI_scaled = map_to_0_100(SGI_raw, rolling_min, rolling_max)
```

Use rolling percentiles or min/max bounds of recent uploads to keep the displayed score stable and interpretable.

## Data Model Requirements
Persist each video’s calculated components so the system can recompute or reweight scores without re-fetching raw metrics:

```
{
  video_id,
  vv7,
  avp,
  ehs,
  spv,
  discovery_score,
  retention_score,
  loyalty_score,
  total_score,
  calculated_at
}
```

Store the component weights in a user-preference table. When users adjust weights, recompute on demand:

```
total_score = w1 * discovery + w2 * retention + w3 * loyalty
```

## Score Breakdown & UI Behaviour
Display the overall eSWTPI score (0–100) with a trend indicator. Beneath the headline score, show three chips or bars for Discovery, Retention, and Loyalty. Allow real-time recalculation when users adjust weights and pair each component with a concise tooltip.

### Progress & Time-Series Tracking
- Keep the SGI (0–100) timeline visible as the quality pulse so creators can monitor creative consistency.
- Pair the pulse with eSWTPI × subscribers gained (or render both series) to surface absolute channel momentum alongside quality.
- For a compound growth curve, compute:

  ```
  ChannelMomentum = normalised(eSWTPI) * log(1 + total_subs)
  ```

  Plotting this helps teams understand how creative quality interacts with subscriber base size over time.

## Insights Extraction
Generate weekly or post-upload insights directly from the stored metrics:

- **Hook improvement:** Compare EHS against the trailing 10-video median → “Your first 30s retention improved +8%.”
- **Content length patterns:** Correlate AVP with duration buckets → “Your 8–12 min videos keep viewers 15% longer.”
- **Upload timing:** Compare VV7 by day/hour → “Tuesday morning videos gain 22% more early views.”
- **Conversion efficiency:** Compare SPV versus the median → “This topic attracted 2.4× more subscribers per 1K views.”

Each insight should present a sentence with a numeric delta so creators can act on it. These insights derive from statistical comparisons—z-scores, moving averages, or percentile shifts—computed against the creator’s own history.

## Future Work
Add an optional CTR-enhanced variant once legitimate access to ImpressionClickThroughRate becomes possible. This version would introduce a Discovery CTR component while retaining the overall structure defined above.
