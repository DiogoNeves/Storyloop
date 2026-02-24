# Phase 0 - Feasibility Spike (Python Workers + FastAPI)

## Goal

Confirm as early as possible that Storyloop can run on Cloudflare Python Workers with FastAPI, and identify blocking runtime constraints before large migration work.

## Decision

Target Option B: Python Workers.

FastAPI support: yes, Cloudflare documents FastAPI on Python Workers.

## Scope

Build a minimal spike app that proves the critical runtime capabilities needed by Storyloop.

Must validate:
- FastAPI request/response flow on Workers
- One DB read/write path against D1
- One outbound call to OpenAI-compatible API
- One SSE streaming endpoint behavior
- One binary upload and binary download path pattern (to test R2-style serving assumptions)

Must assess likely incompatibilities from current code:
- `sqlite3` local file assumptions
- filesystem assumptions for assets
- `to_thread` usage and thread-dependent behavior
- Python package compatibility in Workers runtime

## Fastest way to know if this is possible

Use a dedicated proof-of-compatibility matrix and fail fast:

- Step 1: minimal FastAPI endpoint on Workers
- Step 2: add D1 read/write endpoint
- Step 3: add SSE endpoint with token-style chunks
- Step 4: add outbound model call endpoint
- Step 5: run a compatibility pass on current backend dependencies

If any critical capability fails or has unacceptable constraints, stop and re-evaluate architecture before phase 1.

## Verification checklist

- `make test` and `make build` still pass in current repo
- Spike app serves `/health` successfully in `wrangler dev`
- D1 insert/select roundtrip succeeds
- SSE endpoint streams events to a browser client
- Outbound model API call succeeds with managed secrets
- Upload/download prototype path behaves as expected
- Written compatibility report exists with: `works`, `works with adaptation`, `blocked`
- Go/no-go decision documented

## Exit criteria

Proceed only if all critical capabilities are either:
- confirmed working, or
- clearly adaptable with known effort and no fundamental blocker

## Repository scaffold

Phase-0 spike scaffold now lives in:

- `cloudflare/wrangler.jsonc`
- `cloudflare/src/entry.py`
- `cloudflare/migrations/0001_init.sql`
- `cloudflare/pyproject.toml`

Fast path commands:

```bash
cd cloudflare
uv sync --group dev
npx wrangler login
npx wrangler d1 create storyloop-app
npx wrangler r2 bucket create storyloop-assets
npx wrangler d1 migrations apply storyloop-app --remote
npx wrangler dev
```
