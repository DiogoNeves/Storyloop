"""One-time migration for conversation timestamp normalization.

This migration rewrites the `conversations` and `turns` tables to keep only a
single canonical `created_at` column with timezone-aware UTC ISO timestamps.

Expected execution flow:
1) Stop service
2) Backup database
3) Run on development DB
4) Validate
5) Run on production DB
"""

from __future__ import annotations

import argparse
from datetime import UTC, datetime
from pathlib import Path
import sqlite3

SQLITE_URL_PREFIX = "sqlite:///"


def migrate_database(database_path: Path) -> None:
    if not database_path.exists():
        raise FileNotFoundError(f"Database not found: {database_path}")

    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    try:
        tables = _existing_tables(connection)
        if "conversations" not in tables or "turns" not in tables:
            print(f"[{database_path.name}] conversations/turns tables not found, skipping")
            return

        conversation_count = connection.execute(
            "SELECT COUNT(*) AS count FROM conversations"
        ).fetchone()["count"]
        turns_count = connection.execute(
            "SELECT COUNT(*) AS count FROM turns"
        ).fetchone()["count"]

        connection.execute("PRAGMA foreign_keys = OFF")
        connection.execute("BEGIN IMMEDIATE")
        try:
            _create_target_tables(connection)
            _copy_conversations(connection)
            _copy_turns(connection)
            connection.execute("DROP TABLE turns")
            connection.execute("DROP TABLE conversations")
            connection.execute("ALTER TABLE conversations_next RENAME TO conversations")
            connection.execute("ALTER TABLE turns_next RENAME TO turns")
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.execute("PRAGMA foreign_keys = ON")

        _validate_post_migration(connection, conversation_count, turns_count)
        print(
            f"[{database_path.name}] migrated successfully "
            f"({conversation_count} conversations, {turns_count} turns)"
        )
    finally:
        connection.close()


def _existing_tables(connection: sqlite3.Connection) -> set[str]:
    rows = connection.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()
    return {row["name"] for row in rows}


def _create_target_tables(connection: sqlite3.Connection) -> None:
    connection.execute("DROP TABLE IF EXISTS turns_next")
    connection.execute("DROP TABLE IF EXISTS conversations_next")
    connection.execute(
        """
        CREATE TABLE conversations_next (
            id TEXT PRIMARY KEY,
            title TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE turns_next (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL,
            text TEXT NOT NULL,
            attachments TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(conversation_id) REFERENCES conversations_next(id)
        )
        """
    )


def _copy_conversations(connection: sqlite3.Connection) -> None:
    columns = _table_columns(connection, "conversations")
    has_created_at_utc = "created_at_utc" in columns
    select_columns = "id, title, created_at"
    if has_created_at_utc:
        select_columns += ", created_at_utc"

    rows = connection.execute(
        f"SELECT {select_columns} FROM conversations"
    ).fetchall()

    for row in rows:
        normalized_created_at = _normalize_timestamp(
            row["created_at_utc"] if has_created_at_utc else None,
            row["created_at"],
            context=f"conversation:{row['id']}",
        )
        connection.execute(
            """
            INSERT INTO conversations_next (id, title, created_at)
            VALUES (?, ?, ?)
            """,
            (row["id"], row["title"], normalized_created_at),
        )


def _copy_turns(connection: sqlite3.Connection) -> None:
    columns = _table_columns(connection, "turns")
    has_created_at_utc = "created_at_utc" in columns
    has_attachments = "attachments" in columns
    attachments_column = "attachments" if has_attachments else "NULL AS attachments"
    select_columns = (
        f"id, conversation_id, role, text, {attachments_column}, created_at"
    )
    if has_created_at_utc:
        select_columns += ", created_at_utc"

    rows = connection.execute(
        f"SELECT {select_columns} FROM turns"
    ).fetchall()

    for row in rows:
        normalized_created_at = _normalize_timestamp(
            row["created_at_utc"] if has_created_at_utc else None,
            row["created_at"],
            context=f"turn:{row['id']}",
        )
        connection.execute(
            """
            INSERT INTO turns_next (
                id,
                conversation_id,
                role,
                text,
                attachments,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                row["id"],
                row["conversation_id"],
                row["role"],
                row["text"],
                row["attachments"],
                normalized_created_at,
            ),
        )


def _normalize_timestamp(
    preferred_value: str | None, fallback_value: str | None, *, context: str
) -> str:
    source = preferred_value or fallback_value
    if source is None:
        raise ValueError(f"Missing timestamp for {context}")

    normalized = source.strip()
    if not normalized:
        raise ValueError(f"Empty timestamp for {context}")
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"

    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError(f"Invalid timestamp '{source}' for {context}") from exc

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    else:
        parsed = parsed.astimezone(UTC)

    return parsed.isoformat()


def _validate_post_migration(
    connection: sqlite3.Connection, expected_conversations: int, expected_turns: int
) -> None:
    conversation_columns = _table_columns(connection, "conversations")
    turns_columns = _table_columns(connection, "turns")
    if "created_at_utc" in conversation_columns or "created_at_utc" in turns_columns:
        raise RuntimeError("Migration failed: created_at_utc column still exists")

    conversation_count = connection.execute(
        "SELECT COUNT(*) AS count FROM conversations"
    ).fetchone()["count"]
    turns_count = connection.execute("SELECT COUNT(*) AS count FROM turns").fetchone()[
        "count"
    ]
    if conversation_count != expected_conversations:
        raise RuntimeError("Migration failed: conversation row count mismatch")
    if turns_count != expected_turns:
        raise RuntimeError("Migration failed: turn row count mismatch")

    invalid_rows = connection.execute(
        """
        SELECT id
        FROM conversations
        WHERE created_at NOT LIKE '%+00:00'
        LIMIT 1
        """
    ).fetchone()
    if invalid_rows is not None:
        raise RuntimeError("Migration failed: found non-UTC conversation timestamps")

    invalid_rows = connection.execute(
        """
        SELECT id
        FROM turns
        WHERE created_at NOT LIKE '%+00:00'
        LIMIT 1
        """
    ).fetchone()
    if invalid_rows is not None:
        raise RuntimeError("Migration failed: found non-UTC turn timestamps")


def _table_columns(connection: sqlite3.Connection, table_name: str) -> set[str]:
    rows = connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {row["name"] for row in rows}


def _database_path_from_url(database_url: str) -> Path:
    if not database_url.startswith(SQLITE_URL_PREFIX):
        raise ValueError("Only sqlite:/// URLs are supported")
    raw_path = database_url[len(SQLITE_URL_PREFIX) :]
    if not raw_path:
        raise ValueError("Database path is required")
    return Path(raw_path).expanduser().resolve()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Normalize conversation timestamps and clean legacy columns"
    )
    parser.add_argument(
        "--database-url",
        required=True,
        help="SQLite database URL (e.g. sqlite:///backend/data/dev-storyloop.db)",
    )
    args = parser.parse_args()

    database_path = _database_path_from_url(args.database_url)
    migrate_database(database_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
