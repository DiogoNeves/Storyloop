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
    updated_at: datetime
    category: str
    prompt_body: str | None = None
    prompt_format: str | None = None
    last_smart_update_at: datetime | None = None
    link_url: str | None = None
    thumbnail_url: str | None = None
    video_id: str | None = None
    pinned: bool = False
    archived: bool = False
    archived_at: datetime | None = None


# Column definitions - single source of truth
ENTRY_COLUMNS = (
    "id",
    "title",
    "summary",
    "prompt_body",
    "prompt_format",
    "occurred_at",
    "updated_at",
    "last_smart_update_at",
    "category",
    "link_url",
    "thumbnail_url",
    "video_id",
    "pinned",
    "archived",
    "archived_at",
)


def _row_to_record(row: Row) -> EntryRecord:
    """Convert a SQLite Row to an EntryRecord.

    This is a pure function with no side effects. It handles the common
    pattern of converting database rows to domain objects.
    """
    last_smart_update_at = (
        datetime.fromisoformat(row["last_smart_update_at"])
        if row["last_smart_update_at"]
        else None
    )
    archived_at = (
        datetime.fromisoformat(row["archived_at"]) if row["archived_at"] else None
    )
    return EntryRecord(
        id=row["id"],
        title=row["title"],
        summary=row["summary"],
        occurred_at=datetime.fromisoformat(row["occurred_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
        category=row["category"],
        prompt_body=row["prompt_body"],
        prompt_format=row["prompt_format"],
        last_smart_update_at=last_smart_update_at,
        link_url=row["link_url"],
        thumbnail_url=row["thumbnail_url"],
        video_id=row["video_id"],
        pinned=bool(row["pinned"]),
        archived=bool(row["archived"]),
        archived_at=archived_at,
    )


def _record_to_values(record: EntryRecord) -> tuple:
    """Convert an EntryRecord to a tuple of values for SQL parameters.

    Returns values in the same order as ENTRY_COLUMNS.
    """
    return (
        record.id,
        record.title,
        record.summary,
        record.prompt_body,
        record.prompt_format,
        record.occurred_at.isoformat(),
        record.updated_at.isoformat(),
        record.last_smart_update_at.isoformat()
        if record.last_smart_update_at
        else None,
        record.category,
        record.link_url,
        record.thumbnail_url,
        record.video_id,
        int(record.pinned),
        int(record.archived),
        record.archived_at.isoformat() if record.archived_at else None,
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
                    prompt_body TEXT,
                    prompt_format TEXT,
                    occurred_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    last_smart_update_at TEXT,
                    category TEXT NOT NULL,
                    link_url TEXT,
                    thumbnail_url TEXT,
                    video_id TEXT,
                    pinned INTEGER NOT NULL DEFAULT 0,
                    archived INTEGER NOT NULL DEFAULT 0,
                    archived_at TEXT
                )
                """
            )
            columns = {
                row["name"]
                for row in connection.execute(
                    "PRAGMA table_info(entries)"
                ).fetchall()
            }
            added_updated_at = False
            if "prompt_body" not in columns:
                connection.execute(
                    "ALTER TABLE entries ADD COLUMN prompt_body TEXT"
                )
            if "prompt_format" not in columns:
                connection.execute(
                    "ALTER TABLE entries ADD COLUMN prompt_format TEXT"
                )
            if "updated_at" not in columns:
                connection.execute(
                    "ALTER TABLE entries ADD COLUMN updated_at TEXT"
                )
                added_updated_at = True
            if "last_smart_update_at" not in columns:
                connection.execute(
                    "ALTER TABLE entries ADD COLUMN last_smart_update_at TEXT"
                )
            if "video_id" not in columns:
                connection.execute(
                    "ALTER TABLE entries ADD COLUMN video_id TEXT"
                )
            if "pinned" not in columns:
                connection.execute(
                    "ALTER TABLE entries ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0"
                )
            if "archived" not in columns:
                connection.execute(
                    "ALTER TABLE entries ADD COLUMN archived INTEGER NOT NULL DEFAULT 0"
                )
            if "archived_at" not in columns:
                connection.execute(
                    "ALTER TABLE entries ADD COLUMN archived_at TEXT"
                )
            if "updated_at" in columns or added_updated_at:
                connection.execute(
                    "UPDATE entries SET updated_at = occurred_at WHERE updated_at IS NULL"
                )
            has_fts = (
                connection.execute(
                    """
                    SELECT name
                    FROM sqlite_master
                    WHERE type='table' AND name='entries_fts'
                    """
                ).fetchone()
                is not None
            )
            if has_fts:
                try:
                    detail_row = connection.execute(
                        "SELECT value FROM entries_fts_config WHERE k='detail'"
                    ).fetchone()
                    if detail_row is not None and detail_row["value"] != "full":
                        connection.execute("DROP TABLE entries_fts")
                        has_fts = False
                except Exception:
                    pass
            if not has_fts:
                connection.execute(
                    """
                    CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
                        title,
                        summary,
                        prompt_body,
                        content='entries',
                        content_rowid='rowid',
                        tokenize='trigram',
                        detail='full'
                    )
                    """
                )
            connection.execute(
                """
                CREATE TRIGGER IF NOT EXISTS entries_fts_insert
                AFTER INSERT ON entries
                BEGIN
                    INSERT INTO entries_fts(rowid, title, summary, prompt_body)
                    VALUES (
                        new.rowid,
                        new.title,
                        new.summary,
                        COALESCE(new.prompt_body, '')
                    );
                END
                """
            )
            connection.execute(
                """
                CREATE TRIGGER IF NOT EXISTS entries_fts_delete
                AFTER DELETE ON entries
                BEGIN
                    INSERT INTO entries_fts(entries_fts, rowid, title, summary, prompt_body)
                    VALUES (
                        'delete',
                        old.rowid,
                        old.title,
                        old.summary,
                        COALESCE(old.prompt_body, '')
                    );
                END
                """
            )
            connection.execute(
                """
                CREATE TRIGGER IF NOT EXISTS entries_fts_update
                AFTER UPDATE ON entries
                BEGIN
                    INSERT INTO entries_fts(entries_fts, rowid, title, summary, prompt_body)
                    VALUES (
                        'delete',
                        old.rowid,
                        old.title,
                        old.summary,
                        COALESCE(old.prompt_body, '')
                    );
                    INSERT INTO entries_fts(rowid, title, summary, prompt_body)
                    VALUES (
                        new.rowid,
                        new.title,
                        new.summary,
                        COALESCE(new.prompt_body, '')
                    );
                END
                """
            )
            if not has_fts:
                connection.execute("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')")
            connection.commit()

    def search_entries(
        self,
        *,
        keyword: str,
        category: str = "journal",
        limit: int = 10,
        include_archived: bool = True,
    ) -> list[EntryRecord]:
        """Search entries by keyword using the FTS5 trigram index."""
        normalized = keyword.strip()
        if not normalized or limit <= 0:
            return []
        tokens = [
            "".join(ch for ch in token if ch.isalnum())
            for token in normalized.split()
        ]
        cleaned_tokens = [token for token in tokens if token]
        if not cleaned_tokens:
            return []
        match_query = " ".join(cleaned_tokens)
        where_archived = "" if include_archived else "AND entries.archived = 0"
        with closing(self._connection_factory()) as connection:
            columns_str = ", ".join(f"entries.{col}" for col in ENTRY_COLUMNS)
            rows: Sequence[Row] = connection.execute(
                f"""
                SELECT {columns_str}
                FROM entries
                JOIN entries_fts ON entries.rowid = entries_fts.rowid
                WHERE entries_fts MATCH ?
                AND entries.category = ?
                {where_archived}
                ORDER BY pinned DESC, datetime(updated_at) DESC
                LIMIT ?
                """,
                (match_query, category, limit),
            ).fetchall()

        return [_row_to_record(row) for row in rows]

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

    def list_entries(self, *, include_archived: bool = True) -> list[EntryRecord]:
        """Return all stored entries ordered by recency."""
        where_clause = "" if include_archived else "WHERE archived = 0"
        with closing(self._connection_factory()) as connection:
            columns_str = ", ".join(ENTRY_COLUMNS)
            rows: Sequence[Row] = connection.execute(
                f"""
                SELECT {columns_str}
                FROM entries
                {where_clause}
                ORDER BY pinned DESC, datetime(updated_at) DESC
                """
            ).fetchall()

        return [_row_to_record(row) for row in rows]

    def list_smart_entries(self) -> list[EntryRecord]:
        """Return entries that have smart journal prompts."""
        with closing(self._connection_factory()) as connection:
            columns_str = ", ".join(ENTRY_COLUMNS)
            rows: Sequence[Row] = connection.execute(
                f"""
                SELECT {columns_str}
                FROM entries
                WHERE prompt_body IS NOT NULL
                ORDER BY datetime(updated_at) DESC
                """
            ).fetchall()

        return [_row_to_record(row) for row in rows]

    def update_last_smart_update_at(
        self, entry_id: str, updated_at: datetime
    ) -> bool:
        """Persist the last smart update timestamp for an entry."""
        with closing(self._connection_factory()) as connection:
            cursor = connection.execute(
                """
                UPDATE entries
                SET last_smart_update_at = ?
                WHERE id = ?
                """,
                (updated_at.isoformat(), entry_id),
            )
            connection.commit()

        return cursor.rowcount == 1

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
