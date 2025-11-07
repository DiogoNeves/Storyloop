"""Persistence helpers for user OAuth tokens and channel metadata."""

from __future__ import annotations

from contextlib import closing
from dataclasses import dataclass
from datetime import datetime
from sqlite3 import Row
from typing import TYPE_CHECKING

from app.db import SqliteConnectionFactory

if TYPE_CHECKING:
    from datetime import datetime


@dataclass(slots=True)
class UserRecord:
    """Serialized representation of a user with YouTube OAuth tokens."""

    id: str
    access_token: str
    refresh_token: str | None
    token_expiry: datetime | None
    oauth_state: str | None
    channel_id: str | None
    channel_title: str | None
    channel_thumbnail_url: str | None


# Column definitions - single source of truth
USER_COLUMNS = (
    "id",
    "access_token",
    "refresh_token",
    "token_expiry",
    "oauth_state",
    "channel_id",
    "channel_title",
    "channel_thumbnail_url",
)


def _row_to_record(row: Row) -> UserRecord:
    """Convert a SQLite Row to a UserRecord."""
    return UserRecord(
        id=row["id"],
        access_token=row["access_token"],
        refresh_token=row["refresh_token"],
        token_expiry=(
            datetime.fromisoformat(row["token_expiry"])
            if row["token_expiry"]
            else None
        ),
        oauth_state=row["oauth_state"],
        channel_id=row["channel_id"],
        channel_title=row["channel_title"],
        channel_thumbnail_url=row["channel_thumbnail_url"],
    )


def _record_to_values(record: UserRecord) -> tuple:
    """Convert a UserRecord to a tuple of values for SQL parameters.

    Returns values in the same order as USER_COLUMNS.
    """
    return (
        record.id,
        record.access_token,
        record.refresh_token,
        record.token_expiry.isoformat() if record.token_expiry else None,
        record.oauth_state,
        record.channel_id,
        record.channel_title,
        record.channel_thumbnail_url,
    )


class UserService:
    """High-level operations for persisting user OAuth tokens and channel metadata."""

    def __init__(self, connection_factory: SqliteConnectionFactory) -> None:
        self._connection_factory = connection_factory

    def ensure_schema(self) -> None:
        """Create the users table if it does not already exist.

        The table is designed to store a single user row (id='default').
        """
        with closing(self._connection_factory()) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    access_token TEXT NOT NULL,
                    refresh_token TEXT,
                    token_expiry TEXT,
                    oauth_state TEXT,
                    channel_id TEXT,
                    channel_title TEXT,
                    channel_thumbnail_url TEXT
                )
                """
            )
            connection.commit()

    def get_user(self) -> UserRecord | None:
        """Return the single user record if it exists."""
        with closing(self._connection_factory()) as connection:
            columns_str = ", ".join(USER_COLUMNS)
            row = connection.execute(
                f"""
                SELECT {columns_str}
                FROM users
                WHERE id = 'default'
                """
            ).fetchone()

        if row is None:
            return None

        return _row_to_record(row)

    def save_user(self, user: UserRecord) -> None:
        """Persist or update the user record.

        Ensures only a single user row exists (id='default').
        """
        with closing(self._connection_factory()) as connection:
            columns_str = ", ".join(USER_COLUMNS)
            placeholders = ", ".join("?" * len(USER_COLUMNS))
            set_clauses = ", ".join(
                f"{col} = ?" for col in USER_COLUMNS[1:]
            )  # Skip id

            # Use INSERT OR REPLACE to ensure only one row exists
            connection.execute(
                f"""
                INSERT OR REPLACE INTO users ({columns_str})
                VALUES ({placeholders})
                """,
                _record_to_values(user),
            )
            connection.commit()

    def update_tokens(
        self,
        access_token: str,
        refresh_token: str | None = None,
        token_expiry: datetime | None = None,
    ) -> None:
        """Update OAuth tokens for the existing user.

        Creates a new user record if none exists.
        """
        existing = self.get_user()
        if existing:
            updated = UserRecord(
                id=existing.id,
                access_token=access_token,
                refresh_token=refresh_token or existing.refresh_token,
                token_expiry=token_expiry or existing.token_expiry,
                oauth_state=existing.oauth_state,
                channel_id=existing.channel_id,
                channel_title=existing.channel_title,
                channel_thumbnail_url=existing.channel_thumbnail_url,
            )
        else:
            updated = UserRecord(
                id="default",
                access_token=access_token,
                refresh_token=refresh_token,
                token_expiry=token_expiry,
                oauth_state=None,
                channel_id=None,
                channel_title=None,
                channel_thumbnail_url=None,
            )
        self.save_user(updated)

    def update_channel_metadata(
        self,
        channel_id: str,
        channel_title: str | None = None,
        channel_thumbnail_url: str | None = None,
    ) -> None:
        """Update channel metadata for the existing user.

        Creates a new user record if none exists.
        """
        existing = self.get_user()
        if existing:
            updated = UserRecord(
                id=existing.id,
                access_token=existing.access_token,
                refresh_token=existing.refresh_token,
                token_expiry=existing.token_expiry,
                oauth_state=existing.oauth_state,
                channel_id=channel_id,
                channel_title=channel_title,
                channel_thumbnail_url=channel_thumbnail_url,
            )
        else:
            updated = UserRecord(
                id="default",
                access_token="",
                refresh_token=None,
                token_expiry=None,
                oauth_state=None,
                channel_id=channel_id,
                channel_title=channel_title,
                channel_thumbnail_url=channel_thumbnail_url,
            )
        self.save_user(updated)

    def save_oauth_state(self, state: str, frontend_url: str | None = None) -> None:
        """Save OAuth state for CSRF protection.

        Optionally stores frontend_url encoded with the state.
        """
        # Encode frontend_url with state using a delimiter
        encoded_state = state
        if frontend_url:
            encoded_state = f"{state}|{frontend_url}"

        existing = self.get_user()
        if existing:
            updated = UserRecord(
                id=existing.id,
                access_token=existing.access_token,
                refresh_token=existing.refresh_token,
                token_expiry=existing.token_expiry,
                oauth_state=encoded_state,
                channel_id=existing.channel_id,
                channel_title=existing.channel_title,
                channel_thumbnail_url=existing.channel_thumbnail_url,
            )
        else:
            updated = UserRecord(
                id="default",
                access_token="",
                refresh_token=None,
                token_expiry=None,
                oauth_state=encoded_state,
                channel_id=None,
                channel_title=None,
                channel_thumbnail_url=None,
            )
        self.save_user(updated)

    def get_oauth_state_and_frontend_url(
        self,
    ) -> tuple[str | None, str | None]:
        """Retrieve OAuth state and frontend URL.

        Returns:
            Tuple of (state, frontend_url)
        """
        existing = self.get_user()
        if not existing or not existing.oauth_state:
            return (None, None)

        # Decode state and frontend_url
        parts = existing.oauth_state.split("|", 1)
        if len(parts) == 2:
            return (parts[0], parts[1])
        return (existing.oauth_state, None)

    def clear_oauth_state(self) -> None:
        """Clear the stored OAuth state."""
        existing = self.get_user()
        if existing:
            updated = UserRecord(
                id=existing.id,
                access_token=existing.access_token,
                refresh_token=existing.refresh_token,
                token_expiry=existing.token_expiry,
                oauth_state=None,
                channel_id=existing.channel_id,
                channel_title=existing.channel_title,
                channel_thumbnail_url=existing.channel_thumbnail_url,
            )
            self.save_user(updated)


__all__ = ["UserRecord", "UserService"]
