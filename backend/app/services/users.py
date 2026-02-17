"""Persistence helpers for Storyloop user data."""

from __future__ import annotations

import json
from contextlib import closing
from dataclasses import dataclass
from datetime import UTC, datetime
from sqlite3 import Row
from typing import Literal

from app.services.base import DatabaseService

_DEFAULT_USER_ID = "active"
DEFAULT_SMART_UPDATE_INTERVAL_HOURS = 24
DEFAULT_ACTIVITY_FEED_SORT_DATE: Literal["created", "modified"] = "created"
ALLOWED_ACTIVITY_FEED_SORT_DATES = {"created", "modified"}
DEFAULT_TODAY_ENTRIES_ENABLED = True
DEFAULT_TODAY_INCLUDE_PREVIOUS_INCOMPLETE = True


@dataclass(slots=True)
class UserRecord:
    """Serialized representation of the single Storyloop user."""

    id: str
    channel_id: str | None
    channel_title: str | None
    channel_url: str | None
    channel_thumbnail_url: str | None
    channel_updated_at: datetime | None
    channel_profile_json: str | None
    channel_profile_updated_at: datetime | None
    # Serialized OAuth credentials (JSON string) containing access token, refresh token,
    # and expiry. Used to build authenticated YouTube API clients for fetching channel
    # info during OAuth callback and checking authentication status. Credentials are
    # automatically refreshed when expired.
    credentials_json: str | None
    credentials_updated_at: datetime | None
    credentials_error: str | None
    oauth_state: str | None
    oauth_state_created_at: datetime | None
    smart_update_interval_hours: int | None = None
    show_archived: bool | None = None
    activity_feed_sort_date: Literal["created", "modified"] | None = None
    today_entries_enabled: bool | None = None
    today_include_previous_incomplete: bool | None = None


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
        channel_profile_json=row["channel_profile_json"],
        channel_profile_updated_at=_parse_timestamp(
            row["channel_profile_updated_at"]
        ),
        credentials_json=row["credentials_json"],
        credentials_updated_at=_parse_timestamp(row["credentials_updated_at"]),
        credentials_error=row["credentials_error"],
        oauth_state=row["oauth_state"],
        oauth_state_created_at=_parse_timestamp(row["oauth_state_created_at"]),
        smart_update_interval_hours=row["smart_update_interval_hours"],
        show_archived=bool(row["show_archived"])
        if row["show_archived"] is not None
        else None,
        activity_feed_sort_date=(
            row["activity_feed_sort_date"]
            if row["activity_feed_sort_date"] in ALLOWED_ACTIVITY_FEED_SORT_DATES
            else None
        ),
        today_entries_enabled=bool(row["today_entries_enabled"])
        if row["today_entries_enabled"] is not None
        else None,
        today_include_previous_incomplete=bool(
            row["today_include_previous_incomplete"]
        )
        if row["today_include_previous_incomplete"] is not None
        else None,
    )


class UserService(DatabaseService):
    """High-level operations for persisting YouTube user credentials."""

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
                    channel_profile_json TEXT,
                    channel_profile_updated_at TEXT,
                    credentials_json TEXT,
                    credentials_updated_at TEXT,
                    credentials_error TEXT,
                    oauth_state TEXT,
                    oauth_state_created_at TEXT,
                    smart_update_interval_hours INTEGER,
                    show_archived INTEGER,
                    activity_feed_sort_date TEXT,
                    today_entries_enabled INTEGER,
                    today_include_previous_incomplete INTEGER
                )
                """
            )
            existing_columns = {
                (row["name"] if isinstance(row, Row) else row[1])
                for row in connection.execute("PRAGMA table_info(users)")
            }
            if "credentials_error" not in existing_columns:
                connection.execute(
                    "ALTER TABLE users ADD COLUMN credentials_error TEXT"
                )
            if "smart_update_interval_hours" not in existing_columns:
                connection.execute(
                    "ALTER TABLE users ADD COLUMN smart_update_interval_hours INTEGER"
                )
            if "show_archived" not in existing_columns:
                connection.execute(
                    "ALTER TABLE users ADD COLUMN show_archived INTEGER"
                )
            if "activity_feed_sort_date" not in existing_columns:
                connection.execute(
                    "ALTER TABLE users ADD COLUMN activity_feed_sort_date TEXT"
                )
            if "today_entries_enabled" not in existing_columns:
                connection.execute(
                    "ALTER TABLE users ADD COLUMN today_entries_enabled INTEGER"
                )
            if "today_include_previous_incomplete" not in existing_columns:
                connection.execute(
                    "ALTER TABLE users ADD COLUMN "
                    "today_include_previous_incomplete INTEGER"
                )
            if "channel_profile_json" not in existing_columns:
                connection.execute(
                    "ALTER TABLE users ADD COLUMN channel_profile_json TEXT"
                )
            if "channel_profile_updated_at" not in existing_columns:
                connection.execute(
                    "ALTER TABLE users ADD COLUMN channel_profile_updated_at TEXT"
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

    def get_smart_update_interval_hours(self) -> int:
        """Return the configured smart journal update interval in hours."""
        with closing(self._connection_factory()) as connection:
            row = connection.execute(
                "SELECT smart_update_interval_hours FROM users WHERE id = ?",
                (_DEFAULT_USER_ID,),
            ).fetchone()

        if row is None:
            return DEFAULT_SMART_UPDATE_INTERVAL_HOURS

        value = row["smart_update_interval_hours"]
        if value is None:
            return DEFAULT_SMART_UPDATE_INTERVAL_HOURS

        try:
            hours = int(value)
        except (TypeError, ValueError):
            return DEFAULT_SMART_UPDATE_INTERVAL_HOURS

        if hours < 1:
            return DEFAULT_SMART_UPDATE_INTERVAL_HOURS

        return hours

    def set_smart_update_interval_hours(self, hours: int) -> None:
        """Persist the smart journal update interval in hours."""
        if hours < 1:
            raise ValueError("Smart update interval must be at least 1 hour.")

        with closing(self._connection_factory()) as connection:
            connection.execute(
                """
                INSERT INTO users (id, smart_update_interval_hours)
                VALUES (?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    smart_update_interval_hours=excluded.smart_update_interval_hours
                """,
                (_DEFAULT_USER_ID, int(hours)),
            )
            connection.commit()

    def get_show_archived(self) -> bool:
        """Return whether archived journal entries should be shown in the feed."""
        with closing(self._connection_factory()) as connection:
            row = connection.execute(
                "SELECT show_archived FROM users WHERE id = ?",
                (_DEFAULT_USER_ID,),
            ).fetchone()
        if row is None or row["show_archived"] is None:
            return False
        return bool(row["show_archived"])

    def set_show_archived(self, show_archived: bool) -> None:
        """Persist whether archived journal entries are visible in the feed."""
        with closing(self._connection_factory()) as connection:
            connection.execute(
                """
                INSERT INTO users (id, show_archived)
                VALUES (?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    show_archived=excluded.show_archived
                """,
                (_DEFAULT_USER_ID, int(show_archived)),
            )
            connection.commit()

    def get_activity_feed_sort_date(self) -> Literal["created", "modified"]:
        """Return whether activity feed entries sort by created or modified date."""
        with closing(self._connection_factory()) as connection:
            row = connection.execute(
                "SELECT activity_feed_sort_date FROM users WHERE id = ?",
                (_DEFAULT_USER_ID,),
            ).fetchone()
        if row is None:
            return DEFAULT_ACTIVITY_FEED_SORT_DATE

        value = row["activity_feed_sort_date"]
        if value not in ALLOWED_ACTIVITY_FEED_SORT_DATES:
            return DEFAULT_ACTIVITY_FEED_SORT_DATE
        return value

    def set_activity_feed_sort_date(
        self, sort_date: Literal["created", "modified"]
    ) -> None:
        """Persist whether activity feed entries sort by created or modified date."""
        if sort_date not in ALLOWED_ACTIVITY_FEED_SORT_DATES:
            raise ValueError("Activity feed sort date must be 'created' or 'modified'.")

        with closing(self._connection_factory()) as connection:
            connection.execute(
                """
                INSERT INTO users (id, activity_feed_sort_date)
                VALUES (?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    activity_feed_sort_date=excluded.activity_feed_sort_date
                """,
                (_DEFAULT_USER_ID, sort_date),
            )
            connection.commit()

    def get_today_entries_enabled(self) -> bool:
        """Return whether the Today feature is enabled."""
        with closing(self._connection_factory()) as connection:
            row = connection.execute(
                "SELECT today_entries_enabled FROM users WHERE id = ?",
                (_DEFAULT_USER_ID,),
            ).fetchone()
        if row is None or row["today_entries_enabled"] is None:
            return DEFAULT_TODAY_ENTRIES_ENABLED
        return bool(row["today_entries_enabled"])

    def set_today_entries_enabled(self, enabled: bool) -> None:
        """Persist whether the Today feature is enabled."""
        with closing(self._connection_factory()) as connection:
            connection.execute(
                """
                INSERT INTO users (id, today_entries_enabled)
                VALUES (?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    today_entries_enabled=excluded.today_entries_enabled
                """,
                (_DEFAULT_USER_ID, int(enabled)),
            )
            connection.commit()

    def get_today_include_previous_incomplete(self) -> bool:
        """Return whether Today should include incomplete tasks from yesterday."""
        with closing(self._connection_factory()) as connection:
            row = connection.execute(
                """
                SELECT today_include_previous_incomplete
                FROM users
                WHERE id = ?
                """,
                (_DEFAULT_USER_ID,),
            ).fetchone()
        if row is None or row["today_include_previous_incomplete"] is None:
            return DEFAULT_TODAY_INCLUDE_PREVIOUS_INCOMPLETE
        return bool(row["today_include_previous_incomplete"])

    def set_today_include_previous_incomplete(self, enabled: bool) -> None:
        """Persist whether incomplete tasks roll over into the next Today entry."""
        with closing(self._connection_factory()) as connection:
            connection.execute(
                """
                INSERT INTO users (id, today_include_previous_incomplete)
                VALUES (?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    today_include_previous_incomplete=
                        excluded.today_include_previous_incomplete
                """,
                (_DEFAULT_USER_ID, int(enabled)),
            )
            connection.commit()

    def upsert_credentials(
        self,
        credentials_json: str | None,
        refreshed_at: datetime | None,
        *,
        error_message: str | None = None,
    ) -> None:
        """Persist OAuth credentials for the active user."""

        timestamp_value = refreshed_at.isoformat() if refreshed_at else None
        with closing(self._connection_factory()) as connection:
            connection.execute(
                """
                INSERT INTO users (
                    id,
                    credentials_json,
                    credentials_updated_at,
                    credentials_error
                )
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    credentials_json=excluded.credentials_json,
                    credentials_updated_at=excluded.credentials_updated_at,
                    credentials_error=excluded.credentials_error
                """,
                (
                    _DEFAULT_USER_ID,
                    credentials_json,
                    timestamp_value,
                    error_message,
                ),
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

    def clear_channel_info(self) -> None:
        """Remove stored YouTube channel metadata for the active user."""

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
                ) VALUES (?, NULL, NULL, NULL, NULL, NULL)
                ON CONFLICT(id) DO UPDATE SET
                    channel_id=NULL,
                    channel_title=NULL,
                    channel_url=NULL,
                    channel_thumbnail_url=NULL,
                    channel_updated_at=NULL
                """,
                (_DEFAULT_USER_ID,),
            )
            connection.commit()

    def get_channel_profile(
        self,
    ) -> tuple[dict[str, object] | None, datetime | None]:
        """Return the stored channel profile and last update time."""

        with closing(self._connection_factory()) as connection:
            row = connection.execute(
                """
                SELECT channel_profile_json, channel_profile_updated_at
                FROM users WHERE id = ?
                """,
                (_DEFAULT_USER_ID,),
            ).fetchone()

        if row is None:
            return None, None

        raw_profile = row["channel_profile_json"]
        updated_at = row["channel_profile_updated_at"]
        parsed_updated_at = (
            datetime.fromisoformat(updated_at) if updated_at else None
        )
        if not raw_profile:
            return None, parsed_updated_at

        try:
            profile = json.loads(raw_profile)
        except json.JSONDecodeError:
            return None, parsed_updated_at

        if not isinstance(profile, dict):
            return None, parsed_updated_at

        return profile, parsed_updated_at

    def upsert_channel_profile(self, profile: dict[str, object]) -> datetime:
        """Persist the channel profile for the active user."""

        updated_at = datetime.now(tz=UTC)
        serialized = json.dumps(profile)
        with closing(self._connection_factory()) as connection:
            connection.execute(
                """
                INSERT INTO users (
                    id,
                    channel_profile_json,
                    channel_profile_updated_at
                ) VALUES (?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    channel_profile_json=excluded.channel_profile_json,
                    channel_profile_updated_at=excluded.channel_profile_updated_at
                """,
                (_DEFAULT_USER_ID, serialized, updated_at.isoformat()),
            )
            connection.commit()

        return updated_at

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
