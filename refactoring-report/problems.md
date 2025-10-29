# Immediate Problems Requiring Fixes

## 1. JSON decoding errors bubble out of `_request_json`
`response.json()` raises `ValueError` when the body is empty or malformed, but `_request_json` does not catch it. The caller receives a raw exception instead of a `YoutubeAPIRequestError`, bypassing existing error handling paths.【F:backend/app/services/youtube.py†L323-L349】 Wrap the decode in `try/except` and re-raise a service-level error.

## 2. Error-path JSON parsing can raise during exception handling
When `httpx.HTTPStatusError` is caught, the code immediately calls `exc.response.json()` if the content type hints at JSON.【F:backend/app/services/youtube.py†L331-L339】 If the payload is not valid JSON (common for quota exhaustion responses), this raises again and masks the original HTTP error. Guard the decode with its own `try/except` or fall back to `exc.response.text`.

## 3. Channel resolution ignores query parameters (video URLs fail)
`_candidate_channel_params` only looks at URL path segments; it never examines query parameters such as `v=<videoId>` or `list=<playlistId>`.【F:backend/app/services/youtube.py†L109-L131】 Users who paste a video link receive a `YoutubeChannelNotFound` even though the video ID could be used to look up the channel via the Videos API. Extend parsing to harvest identifiers from query strings.

## 4. Search fallback stops after an unresolvable first hit
The fallback search requests only one result and returns failure if that single channel lacks an uploads playlist or cannot be resolved.【F:backend/app/services/youtube.py†L201-L219】 This prematurely aborts even when the API could return additional matches. Iterate through search results (or request more than one) before raising `YoutubeChannelNotFound`.

## 5. `max_results` parameter silently coerces zero/negative values to one
`_fetch_videos` clamps `max_results` to at least `1`, causing callers requesting zero items (for health checks or metadata-only fetches) to receive an unexpected video in the response.【F:backend/app/services/youtube.py†L269-L321】 Respect a zero request by short-circuiting, or validate inputs earlier and raise a clear error.
