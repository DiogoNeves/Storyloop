# Refactor Plan: Extract API Client Layer

## Overview

Extract HTTP communication logic into a thin API client wrapper. This separates the "how we talk to YouTube" from "what we do with the data", reducing `youtube.py` by ~100 lines.

## Current State

- HTTP request handling embedded in `YoutubeService` (lines 757-790)
- Client session management mixed with business logic (lines 402-417)
- Error handling intertwined with service methods

## Proposed Structure

### New Module: `backend/app/services/youtube_api.py`

```python
"""Thin wrapper around YouTube Data API v3.

This module handles low-level HTTP communication with the YouTube API.
Out of scope: Business logic, data transformation, identifier resolution.
"""

# Class: YoutubeAPIClient
# Methods:
- __init__(api_key, transport, client)
- client_session() -> AsyncContextManager
- request_json(endpoint, params) -> dict[str, Any]
- fetch_channels(params) -> dict
- fetch_videos(params) -> dict
- fetch_playlist_items(playlist_id, params) -> dict
- fetch_search(params) -> dict

# Benefits:
- Clear separation: API client vs service orchestration
- Easier to mock in tests
- Could be reused by other services
- Service focuses on business logic
```

## Benefits

1. **Single Responsibility**: Client handles HTTP, service handles orchestration
2. **Testability**: Can mock API client independently
3. **Reusability**: Other services could use the client
4. **Clarity**: Service methods become more readable

## Migration Steps

1. Create `youtube_api.py` with docstring
2. Move `_request_json` and client session logic
3. Create convenience methods for each endpoint (channels, videos, playlistItems, search)
4. Update `YoutubeService` to use client
5. Update tests to mock client instead of transport
6. Run tests

## File Size Impact

- Reduces `youtube.py` by ~100 lines
- New file: ~80 lines
- Net improvement: Better separation of concerns

## Testing Strategy

- Tests will need to mock API client instead of transport
- Service tests focus on orchestration logic
- Client tests focus on HTTP handling

## Dependencies

- Depends on `httpx` for HTTP client
- Used by `YoutubeService`

## Risks

- Medium risk: Changes to test mocking strategy
- Need to ensure error handling is preserved
- API client abstraction needs to be simple and clear
