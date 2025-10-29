# Refactor: Centralise response parsing and validation

## Why this matters

The service builds `YoutubeChannel` and `YoutubeVideo` instances directly inside `_try_resolve_channel` and `_fetch_videos` while also performing implicit validation (lines 224-321).【F:backend/app/services/youtube.py†L224-L321】 Coupled with `_request_json` (lines 323-349),【F:backend/app/services/youtube.py†L323-L349】 this leads to several issues:

- **Scattered guardrails.** Each method separately checks for missing fields, making it easy to miss new failure modes (e.g. playlist items without snippets) or to forget logging context.
- **Assumed payload shapes.** `_request_json` returns `dict[str, Any]` but never verifies content type or JSON structure, so downstream code will crash with `AttributeError` or `TypeError` if the API changes.
- **Difficult to extend.** Adding support for pagination or richer metadata would require touching multiple methods and duplicating parsing logic.

## What to change

1. Introduce lightweight parser utilities (e.g. `parse_channel_payload`, `parse_playlist_items`) that validate required fields, return typed results, and surface descriptive exceptions.
2. Wrap `response.json()` in `_request_json` with error handling so malformed JSON is converted into `YoutubeAPIRequestError` rather than bubbling as a raw `ValueError`.
3. Have the parser helpers construct dataclasses via dedicated `@classmethod` factories (`YoutubeChannel.from_api`, `YoutubeVideo.from_playlist_item`) to keep transformation logic co-located with the data models.

## Before

```python
payload = await self._request_json(client, "playlistItems", params)
for item in payload.get("items", []):
    snippet = item.get("snippet", {})
    resource = snippet.get("resourceId", {})
    video_id = resource.get("videoId")
    ...
```

## After

```python
payload = await self._request_json(client, "playlistItems", params)
videos = parse_playlist_items(payload)
return [YoutubeVideo.from_playlist_item(item) for item in videos]
```

Codifying these parsing rules in one place will make new fields easier to add, ensure consistent error messaging, and reduce the risk of regressions when the YouTube API introduces new response shapes.
