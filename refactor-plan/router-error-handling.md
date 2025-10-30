# Refactor Plan: Router Error Handling Pattern

**Status**: 🔍 **PLANNED** - Ready for implementation

## Problem Statement

Router endpoints have repetitive error handling patterns:

1. **Repetitive exception-to-HTTP mapping**: The YouTube router (`routers/youtube.py`) has a try/except block that maps service exceptions to HTTPException with specific status codes:
   ```python
   try:
       feed = await youtube_service.fetch_channel_videos(channel)
   except YoutubeConfigurationError as exc:
       raise HTTPException(status_code=503, detail=str(exc)) from exc
   except YoutubeChannelNotFound as exc:
       raise HTTPException(status_code=404, detail=str(exc)) from exc
   except YoutubeAPIRequestError as exc:
       raise HTTPException(status_code=502, detail=str(exc)) from exc
   ```

2. **Repetitive "not found" checks**: The entries router (`routers/entries.py`) has repeated patterns:
   ```python
   record = entry_service.get_entry(entry_id)
   if record is None:
       raise HTTPException(status_code=404, detail="Entry not found")
   ```
   This pattern appears in `get_entry`, `update_entry`, and `delete_entry`.

3. **Inconsistent error handling**: Different routers handle errors differently, making it hard to maintain consistent API error responses.

## Solution Approach

Extract error handling into reusable utilities:

1. **Exception mapper**: Create a mapping function from service exceptions to HTTP status codes
2. **Not-found helper**: Create a dependency or helper function for common "not found" patterns
3. **Consistent error format**: Ensure all errors follow the same structure

## Implementation Plan

### Step 1: Create Error Handling Utilities

Create `backend/app/routers/errors.py`:

```python
"""Shared error handling utilities for router endpoints."""

from __future__ import annotations

from fastapi import HTTPException, status

from app.services.youtube import (
    YoutubeAPIRequestError,
    YoutubeChannelNotFound,
    YoutubeConfigurationError,
    YoutubeError,
)


def handle_youtube_error(exc: YoutubeError) -> HTTPException:
    """Map YouTube service exceptions to HTTPException.
    
    This is a pure function that converts domain exceptions to HTTP responses.
    """
    if isinstance(exc, YoutubeConfigurationError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )
    if isinstance(exc, YoutubeChannelNotFound):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    if isinstance(exc, YoutubeAPIRequestError):
        return HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        )
    # Fallback for unknown YoutubeError subclasses
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=str(exc),
    )


def ensure_exists[T](value: T | None, entity_name: str = "Resource") -> T:
    """Return the value if not None, otherwise raise 404 HTTPException.
    
    This is a pure function for the common "not found" pattern.
    
    Args:
        value: The value to check
        entity_name: Name of the entity for error messages
        
    Returns:
        The value if not None
        
    Raises:
        HTTPException: 404 if value is None
    """
    if value is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{entity_name} not found",
        )
    return value
```

**Rationale**: 
- Pure functions with no side effects
- Single source of truth for error mapping
- Type-safe with generics
- Reusable across routers

### Step 2: Refactor YouTube Router

**Before (`routers/youtube.py`):**
```python
@router.get("/videos")
async def list_channel_videos(
    channel: str = Query(..., min_length=1),
    youtube_service: YoutubeService = Depends(get_youtube_service),
):
    """Return the latest published videos for the requested channel."""
    try:
        feed = await youtube_service.fetch_channel_videos(channel)
    except YoutubeConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except YoutubeChannelNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except YoutubeAPIRequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
        ) from exc
    return feed.to_dict()
```

**After (`routers/youtube.py`):**
```python
from app.routers.errors import handle_youtube_error

@router.get("/videos")
async def list_channel_videos(
    channel: str = Query(..., min_length=1),
    youtube_service: YoutubeService = Depends(get_youtube_service),
):
    """Return the latest published videos for the requested channel."""
    try:
        feed = await youtube_service.fetch_channel_videos(channel)
    except YoutubeError as exc:
        raise handle_youtube_error(exc) from exc
    return feed.to_dict()
```

**Rationale**: 
- Single exception handler catches all YoutubeError subclasses
- Error mapping logic centralized
- Cleaner, more maintainable code

### Step 3: Refactor Entries Router

**Before (`routers/entries.py`):**
```python
@router.get("/{entry_id}", response_model=EntryResponse)
def get_entry(
    entry_id: str, entry_service: EntryService = Depends(get_entry_service)
) -> EntryResponse:
    """Return a single entry by identifier."""
    record = entry_service.get_entry(entry_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    return EntryResponse.from_record(record)
```

**After (`routers/entries.py`):**
```python
from app.routers.errors import ensure_exists

@router.get("/{entry_id}", response_model=EntryResponse)
def get_entry(
    entry_id: str, entry_service: EntryService = Depends(get_entry_service)
) -> EntryResponse:
    """Return a single entry by identifier."""
    record = ensure_exists(
        entry_service.get_entry(entry_id),
        entity_name="Entry",
    )
    return EntryResponse.from_record(record)
```

**Rationale**: 
- Eliminates repetitive None checks
- Consistent error messages
- Type-safe with generics

Apply the same pattern to `update_entry` and `delete_entry`.

### Step 4: Update Tests

- Run existing tests: `make test-backend`
- Verify no behavior changes
- All tests should pass without modification

## Code Example: Complete Refactored Structure

```python
"""Shared error handling utilities for router endpoints."""

from __future__ import annotations

from fastapi import HTTPException, status

from app.services.youtube import (
    YoutubeAPIRequestError,
    YoutubeChannelNotFound,
    YoutubeConfigurationError,
    YoutubeError,
)


def handle_youtube_error(exc: YoutubeError) -> HTTPException:
    """Map YouTube service exceptions to HTTPException.
    
    Pure function that converts domain exceptions to HTTP responses.
    """
    if isinstance(exc, YoutubeConfigurationError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )
    if isinstance(exc, YoutubeChannelNotFound):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    if isinstance(exc, YoutubeAPIRequestError):
        return HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        )
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=str(exc),
    )


def ensure_exists[T](value: T | None, entity_name: str = "Resource") -> T:
    """Return the value if not None, otherwise raise 404 HTTPException.
    
    Pure function for the common "not found" pattern.
    """
    if value is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{entity_name} not found",
        )
    return value
```

## Verification Checklist

- [ ] Error handling utilities created
- [ ] YouTube router refactored to use `handle_youtube_error`
- [ ] Entries router refactored to use `ensure_exists` for all endpoints
- [ ] Tests pass: `make test-backend`
- [ ] No behavior changes (same HTTP status codes and messages)
- [ ] Code is more readable and maintainable

## Benefits

- **Single source of truth**: Error mapping logic centralized
- **Reduced duplication**: Less repetitive code
- **Consistent errors**: All routers handle errors the same way
- **Easier to extend**: Adding new error types is straightforward
- **Type safety**: Generic ensure_exists preserves types

## Risks

- **Low risk**: Pure refactoring with no behavior changes
- **Test coverage**: Existing tests will catch any regressions
- **Backward compatibility**: No API changes

## Functional Programming Preference

The solution uses:
- Pure functions for error mapping (no side effects)
- Type-safe generics for ensure_exists
- Explicit transformations

## Code Quality Principles

- **Clear intention**: Error handling is obvious and centralized
- **Easy to maintain**: Changes propagate automatically
- **Simple and brief**: Just extract, don't over-engineer

## File Scope

**In-scope:**
- `backend/app/routers/errors.py` - New file with error handling utilities
- `backend/app/routers/youtube.py` - Refactor to use error handler
- `backend/app/routers/entries.py` - Refactor to use ensure_exists

**Out-of-scope:**
- Service layer exceptions - Already well-structured
- Frontend error handling - Different concern
- Custom exception classes - Already exist

