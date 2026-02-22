# Phase 5 - Background Processing (Simple Native Path)

## Goal

Replace in-process scheduler/state with a Cloudflare-native approach that is simple first, then scalable only if needed.

## Simplicity-first recommendation

Start with:
- Cron Triggers + idempotent due-scan in D1

Add Queues only if/when needed for:
- burst handling
- async decoupling
- retry control for high-latency tasks

Why this path:
- lowest operational complexity early
- good fit for periodic smart-entry refresh and daily tasks
- avoids early queue orchestration unless requirements demand it

## Notes from project-index (mystash clues)

- `mystash` (Workers JS) shows D1 + Workers can stay simple for webhook-style processing
- `mystash-python` uses explicit queue workers for background-heavy workloads

Inference for Storyloop:
- start without queues if job volume is modest and tasks are idempotent
- introduce queues after metrics show contention/retry needs

## Verification checklist

- `make test` and `make build` pass
- Cron-triggered jobs execute on schedule in staging
- Jobs are idempotent (safe re-run)
- Failure path and retry behavior verified
- No duplicate updates under concurrent runs
- Observability captures run duration, failures, and counts

## Exit criteria

Background processing runs reliably without in-memory single-instance assumptions.
