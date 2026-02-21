"""SQLite helpers for conversation and turn persistence."""

from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from typing import TypedDict
from uuid import uuid4


class ConversationRow(TypedDict):
    """Typed dict for conversations table rows."""

    id: str
    title: str | None
    created_at: str


class ConversationSummaryRow(ConversationRow):
    """Typed dict for list_conversation_summaries rows."""

    last_turn_at: str | None
    last_turn_text: str | None
    first_turn_text: str | None
    turn_count: int


class TurnRow(TypedDict):
    """Typed dict for turns table rows."""

    id: str
    role: str
    text: str
    created_at: str
    attachments: list[str]


def init_conversation_tables(connection: sqlite3.Connection) -> None:
    """Create conversations and turns tables if they don't exist."""
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS turns (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL,
            text TEXT NOT NULL,
            attachments TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(conversation_id) REFERENCES conversations(id)
        )
        """
    )
    turn_columns = _table_columns(connection, "turns")
    if "attachments" not in turn_columns:
        connection.execute("ALTER TABLE turns ADD COLUMN attachments TEXT")
    connection.commit()


def insert_conversation(
    connection: sqlite3.Connection, id: str, title: str | None
) -> ConversationRow:
    """Insert a conversation and return its data."""
    created_at = _now_utc_isoformat()
    connection.execute(
        """
        INSERT INTO conversations (id, title, created_at)
        VALUES (?, ?, ?)
        """,
        (id, title, created_at),
    )
    connection.commit()
    # created_at is always a string, but title can be None
    return {"id": id, "title": title, "created_at": created_at}


def conversation_exists(
    connection: sqlite3.Connection, conversation_id: str
) -> bool:
    """Check if a conversation exists."""
    cursor = connection.execute(
        "SELECT 1 FROM conversations WHERE id = ?", (conversation_id,)
    )
    return cursor.fetchone() is not None


def list_conversation_summaries(
    connection: sqlite3.Connection,
) -> list[ConversationSummaryRow]:
    """Return conversations with their most recent activity."""
    cursor = connection.execute(
        """
        SELECT
            conversations.id,
            conversations.title,
            conversations.created_at,
            (
                SELECT created_at
                FROM turns
                WHERE turns.conversation_id = conversations.id
                ORDER BY created_at DESC
                LIMIT 1
            ) AS last_turn_at,
            (
                SELECT text
                FROM turns
                WHERE turns.conversation_id = conversations.id
                ORDER BY created_at DESC
                LIMIT 1
            ) AS last_turn_text,
            (
                SELECT text
                FROM turns
                WHERE turns.conversation_id = conversations.id
                ORDER BY created_at ASC
                LIMIT 1
            ) AS first_turn_text,
            (
                SELECT COUNT(*)
                FROM turns
                WHERE turns.conversation_id = conversations.id
            ) AS turn_count
        FROM conversations
        WHERE EXISTS (
            SELECT 1 FROM turns WHERE turns.conversation_id = conversations.id
        )
        ORDER BY COALESCE(last_turn_at, conversations.created_at) DESC
        """
    )
    rows = cursor.fetchall()
    return [
        {
            "id": row[0],
            "title": row[1],
            "created_at": _normalize_utc_isoformat(row[2]) or "",
            "last_turn_at": _normalize_utc_isoformat(row[3]),
            "last_turn_text": row[4],
            "first_turn_text": row[5],
            "turn_count": row[6],
        }
        for row in rows
    ]


def insert_turn(
    connection: sqlite3.Connection,
    conversation_id: str,
    role: str,
    text: str,
    attachments: list[str] | None = None,
) -> str:
    """Insert a turn and return its generated UUID."""
    turn_id = str(uuid4())
    created_at = _now_utc_isoformat()
    attachments_payload = json.dumps(attachments or [])
    connection.execute(
        """
        INSERT INTO turns (
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
            turn_id,
            conversation_id,
            role,
            text,
            attachments_payload,
            created_at,
        ),
    )
    connection.commit()
    return turn_id


def list_turns(
    connection: sqlite3.Connection, conversation_id: str
) -> list[TurnRow]:
    """Return ordered list of turns for a conversation."""
    cursor = connection.execute(
        """
        SELECT id, role, text, attachments, created_at
        FROM turns
        WHERE conversation_id = ?
        ORDER BY created_at ASC
        """,
        (conversation_id,),
    )
    rows = cursor.fetchall()
    return [
        {
            "id": row[0],
            "role": row[1],
            "text": row[2],
            "attachments": json.loads(row[3]) if row[3] else [],
            "created_at": _normalize_utc_isoformat(row[4]) or "",
        }
        for row in rows
    ]


def delete_conversation(
    connection: sqlite3.Connection, conversation_id: str
) -> bool:
    """Delete a conversation and its turns. Returns True if a record was removed."""
    cursor = connection.execute(
        "SELECT 1 FROM conversations WHERE id = ?", (conversation_id,)
    )
    if cursor.fetchone() is None:
        return False
    connection.execute(
        "DELETE FROM turns WHERE conversation_id = ?", (conversation_id,)
    )
    connection.execute(
        "DELETE FROM conversations WHERE id = ?", (conversation_id,)
    )
    connection.commit()
    return True


def _table_columns(connection: sqlite3.Connection, table_name: str) -> set[str]:
    return {
        row["name"]
        for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    }

def _normalize_utc_isoformat(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    else:
        parsed = parsed.astimezone(UTC)
    return parsed.isoformat()


def _now_utc_isoformat() -> str:
    return datetime.now(tz=UTC).isoformat()
