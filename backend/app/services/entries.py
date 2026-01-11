"""Persistence helpers for activity entries."""

from __future__ import annotations

from contextlib import closing
from dataclasses import dataclass
from datetime import datetime
from sqlite3 import Row
from typing import Iterable, Sequence

from app.services.base import DatabaseService


@dataclass(slots=True)
class EntryRecord:
    """Serialized representation of a saved activity entry."""

    id: str
    title: str
    summary: str
    occurred_at: datetime
    category: str
    link_url: str | None = None
    thumbnail_url: str | None = None
    video_id: str | None = None
    pinned: bool = False


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
    "pinned",
)


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
        pinned=bool(row["pinned"]),
    )


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
        int(record.pinned),
    )


class EntryService(DatabaseService):
    """High-level operations for persisting Storyloop entries."""

    def ensure_schema(self) -> None:
        """Create the entries table if it does not already exist."""
        with closing(self._connection_factory()) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS entries (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    occurred_at TEXT NOT NULL,
                    category TEXT NOT NULL,
                    link_url TEXT,
                    thumbnail_url TEXT,
                    video_id TEXT,
                    pinned INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            columns = {
                row["name"]
                for row in connection.execute(
                    "PRAGMA table_info(entries)"
                ).fetchall()
            }
            if "video_id" not in columns:
                connection.execute(
                    "ALTER TABLE entries ADD COLUMN video_id TEXT"
                )
            if "pinned" not in columns:
                connection.execute(
                    "ALTER TABLE entries ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0"
                )
            connection.commit()

    def save_new_entries(
        self, entries: Iterable[EntryRecord]
    ) -> list[EntryRecord]:
        """Persist entries that have not been stored previously."""
        records: list[EntryRecord] = list(entries)
        if not records:
            return []

        inserted: list[EntryRecord] = []
        columns_str = ", ".join(ENTRY_COLUMNS)
        placeholders = ", ".join("?" * len(ENTRY_COLUMNS))
        with closing(self._connection_factory()) as connection:
            for record in records:
                cursor = connection.execute(
                    f"""
                    INSERT OR IGNORE INTO entries ({columns_str})
                    VALUES ({placeholders})
                    """,
                    _record_to_values(record),
                )
                if cursor.rowcount == 1:
                    inserted.append(record)
            connection.commit()
        return inserted

    def list_entries(self) -> list[EntryRecord]:
        """Return all stored entries ordered by recency."""
        with closing(self._connection_factory()) as connection:
            columns_str = ", ".join(ENTRY_COLUMNS)
            rows: Sequence[Row] = connection.execute(
                f"""
                SELECT {columns_str}
                FROM entries
                ORDER BY pinned DESC, datetime(occurred_at) DESC
                """
            ).fetchall()

        return [_row_to_record(row) for row in rows]

    def get_entry(self, entry_id: str) -> EntryRecord | None:
        """Return the entry that matches the provided identifier."""
        with closing(self._connection_factory()) as connection:
            columns_str = ", ".join(ENTRY_COLUMNS)
            row = connection.execute(
                f"""
                SELECT {columns_str}
                FROM entries
                WHERE id = ?
                """,
                (entry_id,),
            ).fetchone()

        if row is None:
            return None

        return _row_to_record(row)

    def update_entry(self, entry: EntryRecord) -> bool:
        """Persist updates for an existing entry.

        Returns ``True`` when a record was updated and ``False`` if the entry was
        not found.
        """

        with closing(self._connection_factory()) as connection:
            set_clauses = ", ".join(
                f"{col} = ?" for col in ENTRY_COLUMNS[1:]
            )  # Skip id
            cursor = connection.execute(
                f"""
                UPDATE entries
                SET {set_clauses}
                WHERE id = ?
                """,
                (
                    *_record_to_values(entry)[1:],
                    entry.id,
                ),  # Skip id from values, append at end
            )
            connection.commit()

        return cursor.rowcount == 1

    def delete_entry(self, entry_id: str) -> bool:
        """Remove an entry if it exists."""

        with closing(self._connection_factory()) as connection:
            cursor = connection.execute(
                "DELETE FROM entries WHERE id = ?",
                (entry_id,),
            )
            connection.commit()

        return cursor.rowcount == 1


__all__ = ["EntryRecord", "EntryService"]
