# Refactor Plan: EntryService Database Operation Patterns

## Problem Statement

The `EntryService` class has significant duplication in database operations:

1. **Repeated SQL column lists**: The same column set (`id, title, summary, occurred_at, category, link_url, thumbnail_url, video_id`) appears in multiple places:
   - `list_entries()` SELECT query
   - `get_entry()` SELECT query
   - `save_new_entries()` INSERT query
   - `update_entry()` UPDATE query

2. **Repeated row-to-record conversion**: The logic to convert `sqlite3.Row` to `EntryRecord` is duplicated in `list_entries()` and `get_entry()`.

3. **Connection management pattern**: Each method follows the same pattern:
   ```python
   with closing(self._connection_factory()) as connection:
       # operation
       connection.commit()
   ```

4. **No single source of truth**: If we add a new column, we must update it in multiple places, risking inconsistencies.

## Solution Approach

Extract common patterns into reusable helper functions:

1. **Column constants**: Define the column list once as a constant
2. **Row conversion helper**: Single function to convert `Row` → `EntryRecord`
3. **Database context manager**: Encapsulate connection lifecycle (optional, may be overkill)

## Implementation Plan

### Step 1: Extract Column Definitions

Create a module-level tuple constant listing all column names:

```python
# At module level, after EntryRecord definition
ENTRY_COLUMNS = (
    "id",
    "title",
    "summary",
    "occurred_at",
    "category",
    "link_url",
    "thumbnail_url",
    "video_id",
)
```

**Rationale**: Tuple is immutable and provides single source of truth. Order matters for INSERT.

### Step 2: Extract Row Conversion

Create a pure helper function to convert `Row` → `EntryRecord`:

```python
def _row_to_record(row: Row) -> EntryRecord:
    """Convert a SQLite Row to an EntryRecord.
    
    This is a pure function with no side effects. It handles the common
    pattern of converting database rows to domain objects.
    """
    return EntryRecord(
        id=row["id"],
        title=row["title"],
        summary=row["summary"],
        occurred_at=datetime.fromisoformat(row["occurred_at"]),
        category=row["category"],
        link_url=row["link_url"],
        thumbnail_url=row["thumbnail_url"],
        video_id=row["video_id"],
    )
```

**Rationale**: Pure function, testable, single conversion logic.

### Step 3: Extract Record-to-Values Conversion

Create helper to convert `EntryRecord` → tuple of values for INSERT/UPDATE:

```python
def _record_to_values(record: EntryRecord) -> tuple:
    """Convert an EntryRecord to a tuple of values for SQL parameters.
    
    Returns values in the same order as ENTRY_COLUMNS.
    """
    return (
        record.id,
        record.title,
        record.summary,
        record.occurred_at.isoformat(),
        record.category,
        record.link_url,
        record.thumbnail_url,
        record.video_id,
    )
```

**Rationale**: Keeps INSERT/UPDATE parameter building consistent.

### Step 4: Refactor SQL Building

Update queries to use constants:

**Before (`list_entries`):**
```python
rows: Sequence[Row] = connection.execute(
    """
    SELECT id, title, summary, occurred_at, category, link_url, thumbnail_url, video_id
    FROM entries
    ORDER BY datetime(occurred_at) DESC
    """
).fetchall()

return [
    EntryRecord(
        id=row["id"],
        title=row["title"],
        # ... rest of fields
    )
    for row in rows
]
```

**After (`list_entries`):**
```python
columns_str = ", ".join(ENTRY_COLUMNS)
rows: Sequence[Row] = connection.execute(
    f"""
    SELECT {columns_str}
    FROM entries
    ORDER BY datetime(occurred_at) DESC
    """
).fetchall()

return [_row_to_record(row) for row in rows]
```

**Before (`save_new_entries`):**
```python
cursor = connection.execute(
    """
    INSERT OR IGNORE INTO entries (
        id, title, summary, occurred_at, category, link_url, thumbnail_url, video_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """,
    (
        record.id,
        record.title,
        record.summary,
        record.occurred_at.isoformat(),
        record.category,
        record.link_url,
        record.thumbnail_url,
        record.video_id,
    ),
)
```

**After (`save_new_entries`):**
```python
columns_str = ", ".join(ENTRY_COLUMNS)
placeholders = ", ".join("?" * len(ENTRY_COLUMNS))
cursor = connection.execute(
    f"""
    INSERT OR IGNORE INTO entries ({columns_str})
    VALUES ({placeholders})
    """,
    _record_to_values(record),
)
```

**Before (`update_entry`):**
```python
cursor = connection.execute(
    """
    UPDATE entries
    SET
        title = ?,
        summary = ?,
        occurred_at = ?,
        category = ?,
        link_url = ?,
        thumbnail_url = ?,
        video_id = ?
    WHERE id = ?
    """,
    (
        entry.title,
        entry.summary,
        entry.occurred_at.isoformat(),
        entry.category,
        entry.link_url,
        entry.thumbnail_url,
        entry.video_id,
        entry.id,
    ),
)
```

**After (`update_entry`):**
```python
set_clauses = ", ".join(f"{col} = ?" for col in ENTRY_COLUMNS[1:])  # Skip id
cursor = connection.execute(
    f"""
    UPDATE entries
    SET {set_clauses}
    WHERE id = ?
    """,
    (*_record_to_values(entry)[1:], entry.id),  # Skip id from values, append at end
)
```

### Step 5: Update Tests

- Run existing tests: `make test-backend`
- Verify no behavior changes
- All tests should pass without modification

## Code Example: Complete Refactored Structure

```python
"""Persistence helpers for activity entries."""

from __future__ import annotations

from contextlib import closing
from dataclasses import dataclass
from datetime import datetime
from sqlite3 import Row
from typing import Iterable, Sequence

from ..db import SqliteConnectionFactory


@dataclass(slots=True)
class EntryRecord:
    """Serialized representation of a saved activity entry."""
    # ... fields unchanged ...


# Column definitions - single source of truth
ENTRY_COLUMNS = (
    "id",
    "title",
    "summary",
    "occurred_at",
    "category",
    "link_url",
    "thumbnail_url",
    "video_id",
)


def _row_to_record(row: Row) -> EntryRecord:
    """Convert a SQLite Row to an EntryRecord."""
    return EntryRecord(
        id=row["id"],
        title=row["title"],
        summary=row["summary"],
        occurred_at=datetime.fromisoformat(row["occurred_at"]),
        category=row["category"],
        link_url=row["link_url"],
        thumbnail_url=row["thumbnail_url"],
        video_id=row["video_id"],
    )


def _record_to_values(record: EntryRecord) -> tuple:
    """Convert an EntryRecord to a tuple of values for SQL parameters."""
    return (
        record.id,
        record.title,
        record.summary,
        record.occurred_at.isoformat(),
        record.category,
        record.link_url,
        record.thumbnail_url,
        record.video_id,
    )


class EntryService:
    """High-level operations for persisting Storyloop entries."""
    # ... methods refactored to use helpers ...
```

## Verification Checklist

- [ ] All column lists replaced with `ENTRY_COLUMNS`
- [ ] All row conversions use `_row_to_record()`
- [ ] All INSERT/UPDATE use `_record_to_values()`
- [ ] Tests pass: `make test-backend`
- [ ] No behavior changes (same SQL generated)
- [ ] Code is more readable

## Benefits

- **Single source of truth**: Column changes happen in one place
- **Reduced duplication**: Less code to maintain
- **Fewer bugs**: Less chance of column mismatches between queries
- **Easier to extend**: Adding new columns is straightforward

## Risks

- **Low risk**: This is a pure refactoring with no behavior changes
- **Test coverage**: Existing tests will catch any regressions

## Functional Programming Preference

The solution uses:
- Pure functions for row conversion (no side effects)
- Immutable column definitions
- Explicit data transformations

## Code Quality Principles

- **Clear intention**: Column definitions are obvious and centralized
- **Easy to maintain**: Changes propagate automatically
- **Simple and brief**: No over-engineering, just extraction

## File Scope

**In-scope:**
- `backend/app/services/entries.py` - Refactor EntryService class

**Out-of-scope:**
- Other services (YouTube, GrowthScore) - They have different patterns
- Database schema migration logic - Separate concern
- Router layer - Not affected by this change

