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
                    thumbnail_url TEXT
                )
                """
            )
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
                        thumbnail_url
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        record.id,
                        record.title,
                        record.summary,
                        record.occurred_at.isoformat(),
                        record.category,
                        record.link_url,
                        record.thumbnail_url,
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
                SELECT id, title, summary, occurred_at, category, link_url, thumbnail_url
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
            )
            for row in rows
        ]


__all__ = ["EntryRecord", "EntryService"]
