# Refactoring Analysis: youtube.py

## Summary
The `youtube.py` file is 823 lines long and contains multiple concerns that could be better separated. This document outlines three refactoring opportunities identified through code analysis.

## File Structure Breakdown

### Current Components
1. **Exceptions** (4 classes, ~13 lines)
   - YoutubeError, YoutubeConfigurationError, YoutubeChannelNotFound, YoutubeAPIRequestError

2. **Data Models** (5 dataclasses, ~185 lines)
   - YoutubeVideo, YoutubeChannel, YoutubeFeed, LookupCandidate, UrlIdentifierHints

3. **URL Parsing Logic** (~150 lines)
   - _collect_url_hints, _build_lookup_candidates, helper functions

4. **Service Class** (~400 lines)
   - YoutubeService with HTTP client management, channel resolution, video fetching

5. **Helper Functions** (~75 lines)
   - _select_thumbnail_url, _unique_strings, _unique_dicts

## Identified Refactoring Opportunities

### 1. Extract URL Parsing and Identifier Resolution
**File**: `01-url-parsing-extraction.md`
**Impact**: Reduces file by ~150 lines
**Risk**: Low (pure functions, no side effects)
**Priority**: High (clear separation, easy to extract)

### 2. Extract Data Models
**File**: `02-data-models-extraction.md`
**Impact**: Reduces file by ~200 lines
**Risk**: Medium (imports across codebase)
**Priority**: Medium (follows existing patterns)

### 3. Extract API Client Layer
**File**: `03-api-client-extraction.md`
**Impact**: Reduces file by ~100 lines
**Risk**: Medium (changes test patterns)
**Priority**: Medium (cleaner separation)

## Recommended Approach

### Phase 1: URL Parsing Extraction (Chosen)
**Reason**: Lowest risk, highest clarity improvement, largest independent chunk
- Pure functions with no dependencies on service state
- Clear boundaries and responsibilities
- Easy to test in isolation
- No changes to public API

### Phase 2: Data Models Extraction
After Phase 1 completes successfully, extract models following the pattern established in `entries.py`.

### Phase 3: API Client Extraction
After Phases 1-2, consider extracting API client layer if further simplification is needed.

## Detailed Plan
See `youtube-identifier-extraction.md` for the complete implementation plan for Phase 1.

