# Refactor: Add Explicit Mappers for API Payloads

## Summary
Introduce mapping helpers (e.g., `YoutubeChannel.from_api(item: dict[str, Any])` and `YoutubeVideo.from_playlist_item(item: dict[str, Any])`) that encapsulate the extraction of fields, thumbnail preference rules, and default values. Replace the inline dictionary digging scattered across `_try_resolve_channel` and `_fetch_videos` with calls to these mappers.

## Why this matters
- **Duplication** – Thumbnail selection and default fallbacks are repeated in both channel and video assembly logic, increasing the chance of divergence.【F:backend/app/services/youtube.py†L251-L319】
- **Readability** – Pulling payload-to-model translation into named helpers clarifies the service flow (“fetch → map → return”) and keeps control structures short.
- **Extensibility** – When adding new fields (e.g., view counts, subscriber counts), only the mapper needs to change, preventing parameter churn across service methods.

## Step-by-step outline
1. Define `YoutubeChannel.from_api` and `YoutubeVideo.from_playlist_item` classmethods (or standalone functions) that accept the raw API item and return populated dataclasses. Include defensive handling for missing keys and normalization of URLs.
2. Move thumbnail prioritization logic into a shared helper to avoid subtle differences between channel and video thumbnail selection.
3. Update `_try_resolve_channel` and `_fetch_videos` to call the new mappers. These methods then primarily orchestrate pagination/looping rather than data massaging.
4. Write mapper-specific unit tests feeding trimmed payload fixtures so regressions surface without hitting the external API.

## Before / After Preview
```python
# Before: inline extraction in multiple places
snippet = item.get("snippet", {})
thumbnail = thumbnails.get("high") or thumbnails.get("medium") ...
return YoutubeChannel(...)
```

```python
# After: dedicated mapper centralizes the transformation
return YoutubeChannelMapper.from_channel_item(item)
```

By centralizing payload translation, the service becomes slimmer, easier to test, and less error-prone when YouTube adjusts response shapes.
