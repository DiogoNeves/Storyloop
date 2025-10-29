# Refactor: Extract a Dedicated YouTube API Client Layer

## Summary
Move low-level HTTP concerns (client creation, request execution, response decoding, and error normalization) from `YoutubeService` into a reusable `YoutubeAPIClient`. The service would delegate to this client for all network interactions, focusing solely on orchestrating channel and video retrieval.

## Why this matters
- **Single responsibility** – `_request_json` currently mixes transport setup, error translation, and payload typing inside the service, making the class harder to reason about and extend.【F:backend/app/services/youtube.py†L156-L349】
- **Testability** – With networking logic factored into a small client, tests can mock the client at a higher level rather than patching `httpx.AsyncClient` internals.
- **Configurability** – Centralizing timeout, base URL, auth, and instrumentation unlocks future features (e.g., retries, quota tracking) without touching every call site.

## Step-by-step outline
1. Introduce a `YoutubeAPIClient` class that accepts `api_key` and optional `httpx.AsyncClient` injection (for reuse or testing). Provide async context management so callers can re-use connections when desired.
2. Move `_create_client` and `_request_json` logic into the new client. Convert error handling into dedicated private helpers that return structured errors instead of raising inside the request method, allowing the service to decide how to react.
3. Update `YoutubeService` to depend on the new client (either via constructor injection or lazy instantiation). The service's methods call `client.get_channels(...)`, `client.get_playlist_items(...)`, etc., keeping networking concerns out of the orchestration layer.
4. Add focused tests for the client to assert error translation without involving the higher-level service tests.

## Before / After Preview
```python
# Before: service mixes transport creation and orchestration
async with self._create_client() as client:
    payload = await self._request_json(client, "channels", params)
```

```python
# After: service delegates to a purpose-built client
async with self._api_client() as client:
    payload = await client.channels(params)
```

The refactored shape keeps `YoutubeService` focused on business flows while the new client cleanly encapsulates HTTP details.
