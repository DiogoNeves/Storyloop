"""Persistence helpers for Storyloop user data."""

from __future__ import annotations

from contextlib import closing
from dataclasses import dataclass
from datetime import datetime
from sqlite3 import Row

from app.db import SqliteConnectionFactory

_DEFAULT_USER_ID = "active"


@dataclass(slots=True)
class UserRecord:
    """Serialized representation of the single Storyloop user."""

    id: str
    channel_id: str | None
    channel_title: str | None
    channel_url: str | None
    channel_thumbnail_url: str | None
    channel_updated_at: datetime | None
    # Serialized OAuth credentials (JSON string) containing access token, refresh token,
    # and expiry. Used to build authenticated YouTube API clients for fetching channel
    # info during OAuth callback and checking authentication status. Credentials are
    # automatically refreshed when expired.
    credentials_json: str | None
    credentials_updated_at: datetime | None
    oauth_state: str | None
    oauth_state_created_at: datetime | None


def _row_to_record(row: Row) -> UserRecord:
    """Convert a SQLite row to a :class:`UserRecord`."""

    def _parse_timestamp(value: str | None) -> datetime | None:
        if value is None:
            return None
        return datetime.fromisoformat(value)

    return UserRecord(
        id=row["id"],
        channel_id=row["channel_id"],
        channel_title=row["channel_title"],
        channel_url=row["channel_url"],
        channel_thumbnail_url=row["channel_thumbnail_url"],
        channel_updated_at=_parse_timestamp(row["channel_updated_at"]),
        credentials_json=row["credentials_json"],
        credentials_updated_at=_parse_timestamp(row["credentials_updated_at"]),
        oauth_state=row["oauth_state"],
        oauth_state_created_at=_parse_timestamp(row["oauth_state_created_at"]),
    )


class UserService:
    """High-level operations for persisting YouTube user credentials."""

    def __init__(self, connection_factory: SqliteConnectionFactory) -> None:
        self._connection_factory = connection_factory

    def ensure_schema(self) -> None:
        """Create the ``users`` table when it is missing."""

        with closing(self._connection_factory()) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    channel_id TEXT,
                    channel_title TEXT,
                    channel_url TEXT,
                    channel_thumbnail_url TEXT,
                    channel_updated_at TEXT,
                    credentials_json TEXT,
                    credentials_updated_at TEXT,
                    oauth_state TEXT,
                    oauth_state_created_at TEXT
                )
                """
            )
            connection.commit()

    def get_active_user(self) -> UserRecord | None:
        """Return the single persisted user when available."""

        with closing(self._connection_factory()) as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE id = ?", (_DEFAULT_USER_ID,)
            ).fetchone()

        if row is None:
            return None
        return _row_to_record(row)

    def upsert_credentials(
        self,
        credentials_json: str | None,
        refreshed_at: datetime | None,
    ) -> None:
        """Persist OAuth credentials for the active user."""

        timestamp_value = refreshed_at.isoformat() if refreshed_at else None
        with closing(self._connection_factory()) as connection:
            connection.execute(
                """
                INSERT INTO users (id, credentials_json, credentials_updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    credentials_json=excluded.credentials_json,
                    credentials_updated_at=excluded.credentials_updated_at
                """,
                (_DEFAULT_USER_ID, credentials_json, timestamp_value),
            )
            connection.commit()

    def update_channel_info(
        self,
        *,
        channel_id: str,
        channel_title: str | None,
        channel_url: str | None,
        thumbnail_url: str | None,
        updated_at: datetime | None,
    ) -> None:
        """Persist YouTube channel metadata for the active user."""

        timestamp_value = updated_at.isoformat() if updated_at else None
        with closing(self._connection_factory()) as connection:
            connection.execute(
                """
                INSERT INTO users (
                    id,
                    channel_id,
                    channel_title,
                    channel_url,
                    channel_thumbnail_url,
                    channel_updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    channel_id=excluded.channel_id,
                    channel_title=excluded.channel_title,
                    channel_url=excluded.channel_url,
                    channel_thumbnail_url=excluded.channel_thumbnail_url,
                    channel_updated_at=excluded.channel_updated_at
                """,
                (
                    _DEFAULT_USER_ID,
                    channel_id,
                    channel_title,
                    channel_url,
                    thumbnail_url,
                    timestamp_value,
                ),
            )
            connection.commit()

    def save_oauth_state(self, state: str, created_at: datetime) -> None:
        """Persist the most recent OAuth state token for CSRF protection."""

        with closing(self._connection_factory()) as connection:
            connection.execute(
                """
                INSERT INTO users (id, oauth_state, oauth_state_created_at)
                VALUES (?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    oauth_state=excluded.oauth_state,
                    oauth_state_created_at=excluded.oauth_state_created_at
                """,
                (
                    _DEFAULT_USER_ID,
                    state,
                    created_at.isoformat(),
                ),
            )
            connection.commit()

    def clear_oauth_state(self) -> None:
        """Remove the persisted OAuth state token after validation."""

        with closing(self._connection_factory()) as connection:
            connection.execute(
                """
                INSERT INTO users (id, oauth_state, oauth_state_created_at)
                VALUES (?, NULL, NULL)
                ON CONFLICT(id) DO UPDATE SET
                    oauth_state=NULL,
                    oauth_state_created_at=NULL
                """,
                (_DEFAULT_USER_ID,),
            )
            connection.commit()
