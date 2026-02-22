# Phase 6 - Optional AI Cost Optimization

## Goal

Optionally reduce inference cost while preserving output quality and response latency.

## Scope (optional)

- Introduce model-routing policy by task type
- Keep premium model path for high-value responses
- Use lower-cost models for lightweight tasks where quality is acceptable
- Optionally use AI Gateway for routing/observability controls

## Verification checklist

- `make test` and `make build` pass
- Golden-set quality checks meet defined threshold
- Cost per request and cost per active user improve
- Latency does not regress past agreed threshold
- Fallback path to baseline model is tested

## Exit criteria

Optimization is only kept if quality/latency remain acceptable and measurable cost savings are real.
