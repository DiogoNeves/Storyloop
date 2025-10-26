"""Seed script for inserting demo YouTube metrics into the local database."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DB_PATH = ROOT_DIR / "backend" / ".data" / "storyloop.db"


def ensure_schema(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS youtube_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            video_id TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            published_at TEXT NOT NULL,
            views INTEGER NOT NULL,
            watch_time_minutes REAL NOT NULL,
            ctr REAL NOT NULL,
            avg_view_duration_seconds REAL NOT NULL
        )
        """
    )


def seed_rows(connection: sqlite3.Connection) -> None:
    base_time = datetime.now(tz=UTC)
    rows = [
        (
            "storyloop-001",
            "Editing Insights: Framing the Hook",
            (base_time - timedelta(days=2)).isoformat(),
            4210,
            1832.0,
            0.075,
            312.0,
        ),
        (
            "storyloop-002",
            "Behind-the-scenes: Thumbnail experiments",
            (base_time - timedelta(days=5)).isoformat(),
            3890,
            1624.0,
            0.068,
            287.0,
        ),
        (
            "storyloop-003",
            "Creator Diary: Week 42",
            (base_time - timedelta(days=7)).isoformat(),
            2750,
            1105.0,
            0.054,
            241.0,
        ),
    ]

    connection.executemany(
        """
        INSERT OR REPLACE INTO youtube_metrics (
            video_id,
            title,
            published_at,
            views,
            watch_time_minutes,
            ctr,
            avg_view_duration_seconds
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    connection.commit()


def main() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as connection:
        ensure_schema(connection)
        seed_rows(connection)
    print(f"Inserted demo rows into {DB_PATH}")


if __name__ == "__main__":
    main()
