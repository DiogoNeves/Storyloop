# Refactor Plan: Router Dependency Injection Pattern

**Status**: ✅ **COMPLETED** - All tests passing

## Problem Statement

Routers currently access services via verbose `request.app.state.*` pattern:

1. **Verbose access**: Every router handler repeats:

   ```python
   entry_service: EntryService = request.app.state.entry_service
   ```

2. **No type safety**: `app.state` is `Any`, so no IDE autocomplete or type checking
3. **Boilerplate**: The same pattern repeated in every handler
4. **Testing complexity**: Must mock `app.state` in tests rather than injecting dependencies

## Solution Approach

Use FastAPI's dependency injection system:

1. **Dependency functions**: Create dependency functions that extract services from app state
2. **Type-safe access**: Use FastAPI's `Depends()` with proper typing
3. **Injection**: Let FastAPI handle dependency injection automatically

## Implementation Plan

### Step 1: Create Dependency Module

- Create `backend/app/dependencies.py`
- Define dependency functions for each service:
  ```python
  def get_entry_service(request: Request) -> EntryService:
      return request.app.state.entry_service
  ```

### Step 2: Update Routers

- Update `routers/entries.py` to use `Depends(get_entry_service)`
- Update `routers/youtube.py` to use `Depends(get_youtube_service)`
- Remove `request.app.state.*` access from handlers

### Step 3: Update Type Hints

- Ensure dependency functions have proper return type hints
- FastAPI will automatically provide type hints to handlers

### Step 4: Update Tests

- Tests can now override dependencies via FastAPI's test client
- Simpler mocking: just override the dependency function

## Benefits

- **Less boilerplate**: Handlers declare dependencies, FastAPI injects them
- **Type safety**: IDE autocomplete and type checking work
- **Testability**: Easy to override dependencies in tests
- **Consistency**: All routers use the same pattern
- **FastAPI best practice**: Uses framework's intended pattern

## Risks

- **Low risk**: FastAPI's dependency system is well-established
- **Import paths**: Need to ensure dependencies module is accessible
- **Test updates**: May need to update test fixtures

## Functional Programming Preference

The solution uses:

- Pure dependency functions (no side effects, just extraction)
- Function composition via FastAPI's dependency system
- Explicit dependencies (declarative)

## Code Quality Principles

- **Clear intention**: Dependencies are explicit in function signatures
- **Easy to maintain**: Standard FastAPI pattern
- **Simple and brief**: Leverage framework features, don't reinvent

## File Scope

**In-scope:**

- `backend/app/routers/entries.py` - Use dependency injection
- `backend/app/routers/youtube.py` - Use dependency injection
- `backend/app/routers/health.py` - Use dependency injection (if needed)
- `backend/app/dependencies.py` - New file with dependency functions

**Out-of-scope:**

- Service implementations - No changes needed
- App state setup - No changes needed
- Background jobs - Different pattern (scheduler injection)

## Example Transformation

**Before:**

```python
@router.get("/")
def list_entries(request: Request) -> list[EntryResponse]:
    entry_service: EntryService = request.app.state.entry_service
    records = entry_service.list_entries()
    return [EntryResponse.from_record(record) for record in records]
```

**After:**

```python
@router.get("/")
def list_entries(
    entry_service: EntryService = Depends(get_entry_service)
) -> list[EntryResponse]:
    records = entry_service.list_entries()
    return [EntryResponse.from_record(record) for record in records]
```
