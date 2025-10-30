# Refactor Plan: Extract Data Models

## Overview

Move all data models (dataclasses) and exception classes into a separate module. This follows the pattern seen in other services and reduces `youtube.py` by ~200 lines.

## Current State

- 5 dataclasses mixed with service logic (lines 43-228)
- 4 exception classes (lines 27-40)
- Models and service logic intertwined

## Proposed Structure

### New Module: `backend/app/services/youtube_models.py`

```python
"""YouTube API data models and exceptions.

This module defines the data structures used to represent YouTube
channels, videos, and feeds returned from the YouTube Data API.
Out of scope: API communication logic, URL parsing, business rules.
"""

# Exceptions:
- YoutubeError
- YoutubeConfigurationError
- YoutubeChannelNotFound
- YoutubeAPIRequestError

# Data Models:
- YoutubeVideo
- YoutubeChannel
- YoutubeFeed
- LookupCandidate (or move with identifier module)
- UrlIdentifierHints (or move with identifier module)
```

## Benefits

1. **Consistency**: Matches pattern from `entries.py` (EntryRecord)
2. **Clear boundaries**: Models separate from service logic
3. **Easier imports**: Other modules can import models without service
4. **Better organization**: Models can be understood independently

## Migration Steps

1. Create `youtube_models.py` with clear docstring
2. Move exceptions and dataclasses
3. Ensure all imports are updated (especially `from_playlist_item`, `from_api_item`, `to_dict` methods)
4. Update `youtube.py` imports
5. Update `services/__init__.py` exports
6. Run tests

## File Size Impact

- Reduces `youtube.py` by ~200 lines
- New file: ~220 lines
- Net improvement: Better separation

## Testing Strategy

- Models have their own test coverage
- Service tests should continue to work
- Can add focused model tests

## Dependencies

- Models depend on `app.utils.datetime` (parse_datetime, parse_duration_seconds)
- Models are imported by router layer

## Risks

- Medium risk: Need to update multiple import locations
- Models are used by router (`routers/youtube.py`)
- Need to ensure `services/__init__.py` exports correctly
