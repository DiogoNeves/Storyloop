"""SQLite helpers for conversation and turn persistence."""

from __future__ import annotations

import sqlite3
from datetime import datetime
from uuid import uuid4


def init_conversation_tables(connection: sqlite3.Connection) -> None:
    """Create conversations and turns tables if they don't exist."""
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(conversation_id) REFERENCES conversations(id)
        )
        """
    )
    connection.commit()


def insert_conversation(
    connection: sqlite3.Connection, id: str, title: str | None
) -> dict[str, str | None]:
    """Insert a conversation and return its data."""
    created_at = datetime.utcnow().isoformat()
    connection.execute(
        "INSERT INTO conversations (id, title, created_at) VALUES (?, ?, ?)",
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
) -> list[dict[str, str | None | int]]:
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
            "created_at": row[2],
            "last_turn_at": row[3],
            "last_turn_text": row[4],
            "turn_count": row[5],
        }
        for row in rows
    ]


def insert_turn(
    connection: sqlite3.Connection,
    conversation_id: str,
    role: str,
    text: str,
) -> str:
    """Insert a turn and return its generated UUID."""
    turn_id = str(uuid4())
    created_at = datetime.utcnow().isoformat()
    connection.execute(
        """
        INSERT INTO turns (id, conversation_id, role, text, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (turn_id, conversation_id, role, text, created_at),
    )
    connection.commit()
    return turn_id


def list_turns(
    connection: sqlite3.Connection, conversation_id: str
) -> list[dict[str, str]]:
    """Return ordered list of turns for a conversation."""
    cursor = connection.execute(
        """
        SELECT id, role, text, created_at
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
            "created_at": row[3],
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
