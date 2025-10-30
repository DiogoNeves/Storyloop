# Refactor Plan: Extract URL Parsing and Identifier Resolution

## Overview
Move URL parsing, identifier hint extraction, and lookup candidate building logic into a separate, focused module. This will reduce the `youtube.py` file size by ~150 lines and improve maintainability.

## Current State
- URL parsing logic is embedded in `youtube.py` (lines 235-314)
- Helper functions scattered throughout (`_clean_handle`, `_collect_url_hints`, `_build_lookup_candidates`, `_unique_strings`, `_unique_dicts`)
- Tightly coupled to the service class despite being pure functions

## Proposed Structure

### New Module: `backend/app/services/youtube_identifier.py`
```python
"""YouTube identifier parsing and resolution logic.

This module handles parsing various YouTube URL formats and identifiers
to extract channel IDs, handles, usernames, and video IDs for lookup.
"""

# Functions to extract:
- _clean_handle()
- _collect_url_hints()
- _build_lookup_candidates()
- _unique_strings()
- _unique_dicts()

# Data classes to move:
- LookupCandidate
- UrlIdentifierHints

# Constants:
- CHANNEL_ID_PATTERN
```

## Benefits
1. **Separation of concerns**: URL parsing is independent of API communication
2. **Testability**: Pure functions can be tested in isolation
3. **Reusability**: Could be used by other modules if needed
4. **Clarity**: Service class focuses on orchestration, not parsing

## Migration Steps
1. Create `youtube_identifier.py` with docstring explaining scope
2. Move helper functions and dataclasses
3. Update imports in `youtube.py`
4. Run tests to ensure nothing breaks
5. Update `services/__init__.py` if needed

## File Size Impact
- Reduces `youtube.py` by ~150 lines
- New file: ~120 lines
- Net improvement: Better organization

## Testing Strategy
- Existing tests should continue to pass
- No changes to public API
- Can add focused unit tests for parsing logic

## Risks
- Low risk: Pure functions with no side effects
- Need to ensure imports are correct

