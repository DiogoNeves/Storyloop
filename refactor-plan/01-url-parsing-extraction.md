# Refactor Plan: Extract URL Parsing and Identifier Resolution

**Status**: ✅ COMPLETED (2024)

## Overview

✅ Successfully moved URL parsing, identifier hint extraction, and lookup candidate building logic into a separate, focused module. Reduced the `youtube.py` file size by 183 lines (~22%) and improved maintainability.

## Execution Summary

### Results

- **Original**: `youtube.py` (823 lines)
- **After**: `youtube.py` (640 lines) + `youtube_identifier.py` (211 lines)
- **Reduction**: 183 lines removed from main file
- **Tests**: All 19 tests passing ✅
- **Type Checking**: Passes ✅

### Extracted Components

✅ All of the following were successfully extracted to `youtube_identifier.py`:

- CHANNEL_ID_PATTERN constant
- LookupCandidate dataclass
- UrlIdentifierHints dataclass
- clean_handle() function (renamed from `_clean_handle`)
- collect_url_hints() function (renamed from `_collect_url_hints`)
- unique_strings() function (renamed from `_unique_strings`)
- unique_dicts() function (renamed from `_unique_dicts`)
- build_lookup_candidates() function (renamed from `_build_lookup_candidates`)

## Previous State (Before Refactoring)

- URL parsing logic was embedded in `youtube.py` (lines 235-314)
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

## Migration Steps (Completed)

✅ 1. Created `youtube_identifier.py` with docstring explaining scope
✅ 2. Moved helper functions and dataclasses
✅ 3. Updated imports in `youtube.py`
✅ 4. Ran tests - all 19 tests passing
✅ 5. Updated tests to handle video duration API calls

## File Size Impact (Achieved)

- ✅ Reduced `youtube.py` by 183 lines (actual: exceeded ~150 line estimate)
- ✅ New file: 211 lines (slightly larger than estimated ~120 lines due to comprehensive docstrings)
- ✅ Net improvement: Better organization achieved

## Testing Strategy (Verification)

- ✅ Existing tests continue to pass (19/19)
- ✅ No changes to public API
- ✅ All functionality preserved

## Risks (Mitigated)

- ✅ Low risk confirmed: Pure functions extracted without issues
- ✅ Imports verified correct
- ✅ No breaking changes introduced
