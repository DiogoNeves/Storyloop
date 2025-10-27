"""Feed entries data models and CRUD operations."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from uuid import uuid4

from pydantic import BaseModel, Field


class CreateFeedEntry(BaseModel):
    """Input model for creating a new feed entry."""

    title: str = Field(min_length=1)
    summary: str = Field(min_length=1)
    date: str  # ISO8601 datetime string
    category: str


class FeedEntry(BaseModel):
    """Response model for a feed entry."""

    id: str
    title: str
    summary: str
    date: str
    category: str


def create_feed_entry(
    conn: sqlite3.Connection,
    entry: CreateFeedEntry,
) -> FeedEntry:
    """Insert a new feed entry and return it with generated ID."""
    entry_id = str(uuid4())
    created_at = datetime.now(UTC).isoformat()

    conn.execute(
        """
        INSERT INTO feed_entries (id, title, summary, date, category, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (entry_id, entry.title, entry.summary, entry.date, entry.category, created_at),
    )
    conn.commit()

    return FeedEntry(
        id=entry_id,
        title=entry.title,
        summary=entry.summary,
        date=entry.date,
        category=entry.category,
    )


def get_feed_entries(conn: sqlite3.Connection) -> list[FeedEntry]:
    """Return all feed entries ordered by date descending."""
    cursor = conn.execute(
        """
        SELECT id, title, summary, date, category
        FROM feed_entries
        ORDER BY date DESC
        """
    )
    rows = cursor.fetchall()
    return [
        FeedEntry(
            id=row["id"],
            title=row["title"],
            summary=row["summary"],
            date=row["date"],
            category=row["category"],
        )
        for row in rows
    ]
