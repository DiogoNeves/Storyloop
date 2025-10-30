# Detailed Refactor Plan: Extract URL Parsing and Identifier Resolution

## Goal
Extract URL parsing, identifier hint extraction, and lookup candidate building logic from `youtube.py` into a dedicated module. This reduces the main service file from 823 lines to approximately 670 lines, improving readability and maintainability.

## Current State Analysis

### Functions to Extract (lines 230-380)
- `_clean_handle()` - Strips @ prefix from handles
- `_collect_url_hints()` - Parses YouTube URLs and extracts identifiers
- `_build_lookup_candidates()` - Constructs ordered lookup attempts
- `_unique_strings()` - Deduplicates strings while preserving order
- `_unique_dicts()` - Deduplicates dictionaries while preserving order

### Data Classes to Extract
- `LookupCandidate` (lines 212-218) - Represents a single lookup attempt
- `UrlIdentifierHints` (lines 220-228) - Structured hints from URLs

### Constants to Extract
- `CHANNEL_ID_PATTERN` (line 22) - Regex for validating channel IDs

### Dependencies
- `_collect_url_hints` uses `urlparse`, `parse_qs` from `urllib.parse`
- `_build_lookup_candidates` uses `CHANNEL_ID_PATTERN` and `_collect_url_hints`
- All functions are pure (no side effects, no dependencies on service state)

## Proposed Structure

### New File: `backend/app/services/youtube_identifier.py`

```python
"""YouTube identifier parsing and resolution utilities.

This module handles parsing various YouTube identifier formats (URLs, handles,
channel IDs, usernames) and building lookup candidates for channel resolution.

Scope:
- URL parsing and identifier extraction
- Lookup candidate generation
- Identifier validation and normalization

Out of scope:
- API communication (handled by YoutubeService)
- Channel resolution logic (handled by YoutubeService)
- Data model definitions (handled by youtube_models.py)
"""

import re
from dataclasses import dataclass
from typing import Literal
from urllib.parse import parse_qs, urlparse

from collections.abc import Iterable

# Constants
CHANNEL_ID_PATTERN = re.compile(r"^UC[0-9A-Za-z_-]{22}$")

# Data Classes
@dataclass(slots=True)
class LookupCandidate:
    """Represents a single lookup attempt against the YouTube API."""
    endpoint: Literal["channels", "video"]
    params: dict[str, str]

@dataclass(slots=True)
class UrlIdentifierHints:
    """Structured hints extracted from a potential YouTube URL."""
    channel_ids: list[str]
    handles: list[str]
    usernames: list[str]
    video_ids: list[str]

# Functions (all public, no leading underscore)
def clean_handle(value: str) -> str:
    """Strip the leading @ from handle-like identifiers."""
    ...

def collect_url_hints(identifier: str) -> UrlIdentifierHints | None:
    """Extract structured lookup hints from a potential YouTube URL."""
    ...

def unique_strings(values: Iterable[str]) -> list[str]:
    """Deduplicate strings while preserving order."""
    ...

def unique_dicts(candidates: Iterable[dict[str, str]]) -> list[dict[str, str]]:
    """Deduplicate dictionaries while preserving order."""
    ...

def build_lookup_candidates(identifier: str) -> list[LookupCandidate]:
    """Construct ordered lookup attempts for a channel identifier."""
    ...
```

### Updated File: `backend/app/services/youtube.py`

```python
# Remove extracted functions and classes
# Update imports:
from app.services.youtube_identifier import (
    CHANNEL_ID_PATTERN,
    LookupCandidate,
    UrlIdentifierHints,
    build_lookup_candidates,
)

# Update usage in _resolve_channel:
# Change: _build_lookup_candidates(identifier)
# To: build_lookup_candidates(identifier)
```

## Implementation Steps

### Step 1: Create New Module
1. Create `backend/app/services/youtube_identifier.py`
2. Add module docstring explaining scope
3. Copy constants, dataclasses, and functions
4. Remove leading underscores from function names (make them public)
5. Add function docstrings if missing

### Step 2: Update youtube.py
1. Remove extracted code
2. Add import statement for new module
3. Update function calls:
   - `_build_lookup_candidates()` → `build_lookup_candidates()`
   - `_unique_strings()` → `unique_strings()` (if used elsewhere)
   - `_unique_dicts()` → `unique_dicts()` (if used elsewhere)
   - `_clean_handle()` → `clean_handle()` (if used elsewhere)
   - `_collect_url_hints()` → `collect_url_hints()` (if used elsewhere)

### Step 3: Update Exports
1. Update `backend/app/services/__init__.py` if needed:
   ```python
   from app.services.youtube_identifier import (
       LookupCandidate,
       UrlIdentifierHints,
   )
   ```

### Step 4: Update Tests
1. Check `backend/tests/services/test_youtube.py`
2. Tests should continue to pass without changes
3. Optionally add focused unit tests for parsing functions in `test_youtube_identifier.py`

### Step 5: Verify
1. Run `make test-backend` to ensure all tests pass
2. Run `uv run ruff check backend` to check linting
3. Run `uv run mypy backend` to check type checking

## Expected Outcomes

### File Size Reduction
- `youtube.py`: ~823 lines → ~670 lines (153 lines removed)
- `youtube_identifier.py`: ~150 lines (new file)
- Net improvement: Better organization, clearer separation of concerns

### Benefits
1. **Improved Readability**: Service class focuses on orchestration
2. **Better Testability**: Pure functions can be tested independently
3. **Clearer Boundaries**: URL parsing is separate from API communication
4. **Reusability**: Parsing logic could be used by other modules
5. **Easier Maintenance**: Changes to URL parsing don't affect service logic

### Risks and Mitigation
- **Risk**: Breaking changes if imports are incorrect
  - **Mitigation**: Comprehensive test coverage, gradual migration
- **Risk**: Missing dependencies
  - **Mitigation**: Careful code review, type checking
- **Risk**: Accidental coupling through shared state
  - **Mitigation**: All functions are pure - no shared state

## Testing Strategy

### Unit Tests for New Module
Create `backend/tests/services/test_youtube_identifier.py`:

```python
"""Tests for YouTube identifier parsing utilities."""

from app.services.youtube_identifier import (
    build_lookup_candidates,
    clean_handle,
    collect_url_hints,
    unique_strings,
    unique_dicts,
)

def test_clean_handle():
    assert clean_handle("@storyloop") == "storyloop"
    assert clean_handle("storyloop") == "storyloop"

def test_collect_url_hints_from_channel_url():
    hints = collect_url_hints("https://youtube.com/channel/UC123")
    assert hints is not None
    assert "UC123" in hints.channel_ids

def test_build_lookup_candidates():
    candidates = build_lookup_candidates("@storyloop")
    assert len(candidates) > 0
    assert candidates[0].endpoint == "channels"
```

### Integration Tests
Existing tests in `test_youtube.py` should continue to pass without modification, as they test the service layer which uses these functions.

## Rollback Plan
If issues arise:
1. Revert git commit
2. Functions are pure, so no data corruption risk
3. All changes are in separate file, easy to rollback

## Follow-up Opportunities
After this refactor:
1. Extract data models (separate plan)
2. Extract API client layer (separate plan)
3. Add more comprehensive URL format support
4. Add caching for identifier resolution

## Notes
- All extracted functions are pure (no side effects)
- No changes to public API surface
- Backward compatible - only internal refactoring
- Follows functional programming preference
- Keeps solutions simple and straightforward

