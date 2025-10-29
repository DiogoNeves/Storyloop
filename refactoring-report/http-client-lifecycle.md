# Refactor: Reuse and inject the HTTP client

## Why this matters

`YoutubeService.fetch_channel_videos` creates a fresh `httpx.AsyncClient` via `_create_client` for every call (lines 156-181).【F:backend/app/services/youtube.py†L156-L181】 While simple, this pattern causes several problems as the service scales:

- **Connection churn.** Each invocation opens and tears down a client session, forfeiting connection pooling and adding latency under load.
- **Testing pain.** The only way to stub network traffic is to pass a custom transport into the constructor, which couples tests to httpx internals and prevents swapping in a fully mocked client.
- **Missing observability hooks.** There is nowhere to inject logging, tracing, or retry policies that operate across multiple requests.

## What to change

1. Let the service accept an optional `httpx.AsyncClient` (or context manager) so callers that already manage a client can reuse it.
2. Expose an async context manager on the service (e.g. `async with YoutubeService.session() as client:`) that creates a shared client and tears it down deterministically.
3. Centralise configuration (timeout, base URL, headers) in one place so future features—like quota tracking headers or per-request timeouts—can plug in cleanly.

## Before

```python
async with self._create_client() as client:
    channel = await self._resolve_channel(client, trimmed_identifier)
    videos = await self._fetch_videos(client, channel.uploads_playlist_id, ...)
```

## After

```python
async with self.client_session() as client:
    channel = await self._resolve_channel(client, trimmed_identifier)
    videos = await self._fetch_videos(client, channel.uploads_playlist_id, ...)
```

By making client lifecycle management explicit, we gain lower latency via connection reuse, unlock richer dependency injection in tests, and create a single choke point for observability tooling.
