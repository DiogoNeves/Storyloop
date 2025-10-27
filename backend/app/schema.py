"""Database schema initialization."""

import sqlite3


def ensure_schema(connection: sqlite3.Connection) -> None:
    """Create all required tables if they don't exist."""
    connection.execute("""
        CREATE TABLE IF NOT EXISTS feed_entries (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            date TEXT NOT NULL,
            category TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    connection.commit()
