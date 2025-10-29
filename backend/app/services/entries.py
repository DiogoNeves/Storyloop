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

    id: str
    title: str
    summary: str
    occurred_at: datetime
    category: str
    link_url: str | None = None
    thumbnail_url: str | None = None
    video_id: str | None = None


class EntryService:
    """High-level operations for persisting Storyloop entries."""

    def __init__(self, connection_factory: SqliteConnectionFactory) -> None:
        self._connection_factory = connection_factory

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
                    video_id TEXT
                )
                """
            )
            columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(entries)").fetchall()
            }
            if "video_id" not in columns:
                connection.execute("ALTER TABLE entries ADD COLUMN video_id TEXT")
            connection.commit()

    def save_new_entries(self, entries: Iterable[EntryRecord]) -> list[EntryRecord]:
        """Persist entries that have not been stored previously."""
        records = list(entries)
        if not records:
            return []

        inserted: list[EntryRecord] = []
        with closing(self._connection_factory()) as connection:
            for record in records:
                cursor = connection.execute(
                    """
                    INSERT OR IGNORE INTO entries (
                        id,
                        title,
                        summary,
                        occurred_at,
                        category,
                        link_url,
                        thumbnail_url,
                        video_id
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
                if cursor.rowcount == 1:
                    inserted.append(record)
            connection.commit()
        return inserted

    def list_entries(self) -> list[EntryRecord]:
        """Return all stored entries ordered by recency."""
        with closing(self._connection_factory()) as connection:
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
                summary=row["summary"],
                occurred_at=datetime.fromisoformat(row["occurred_at"]),
                category=row["category"],
                link_url=row["link_url"],
                thumbnail_url=row["thumbnail_url"],
                video_id=row["video_id"],
            )
            for row in rows
        ]

    def get_entry(self, entry_id: str) -> EntryRecord | None:
        """Return the entry that matches the provided identifier."""
        with closing(self._connection_factory()) as connection:
            row = connection.execute(
                """
                SELECT id, title, summary, occurred_at, category, link_url, thumbnail_url, video_id
                FROM entries
                WHERE id = ?
                """,
                (entry_id,),
            ).fetchone()

        if row is None:
            return None

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

    def update_entry(self, entry: EntryRecord) -> bool:
        """Persist updates for an existing entry.

        Returns ``True`` when a record was updated and ``False`` if the entry was
        not found.
        """

        with closing(self._connection_factory()) as connection:
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
