"""Persistence helpers for Storyloop user data."""

from __future__ import annotations

from contextlib import closing
from dataclasses import dataclass
from datetime import datetime
from sqlite3 import Row
from typing import Literal, cast

from app.services.base import DatabaseService

_DEFAULT_USER_ID = "active"
AccentPreference = Literal["crimson", "rose", "emerald", "azure", "violet"]
DEFAULT_SMART_UPDATE_INTERVAL_HOURS = 24
DEFAULT_ACTIVITY_FEED_SORT_DATE: Literal["created", "modified"] = "created"
ALLOWED_ACTIVITY_FEED_SORT_DATES = {"created", "modified"}
DEFAULT_ACCENT_COLOR: AccentPreference = "crimson"
ALLOWED_ACCENT_COLORS = {
    "crimson",
    "rose",
    "emerald",
    "azure",
    "violet",
}
DEFAULT_TODAY_ENTRIES_ENABLED = True
DEFAULT_TODAY_INCLUDE_PREVIOUS_INCOMPLETE = True
DEFAULT_TODAY_MOVE_COMPLETED_TO_END = True
_REMOVED_CHANNEL_PROFILE_COLUMNS = {
    "channel_profile_json",
    "channel_profile_updated_at",
}
_USERS_TABLE_SCHEMA: tuple[tuple[str, str], ...] = (
    ("id", "TEXT PRIMARY KEY"),
    ("channel_id", "TEXT"),
    ("channel_title", "TEXT"),
    ("channel_url", "TEXT"),
    ("channel_thumbnail_url", "TEXT"),
    ("channel_updated_at", "TEXT"),
    ("credentials_json", "TEXT"),
    ("credentials_updated_at", "TEXT"),
    ("credentials_error", "TEXT"),
    ("oauth_state", "TEXT"),
    ("oauth_state_created_at", "TEXT"),
    ("smart_update_interval_hours", "INTEGER"),
    ("show_archived", "INTEGER"),
    ("activity_feed_sort_date", "TEXT"),
    ("today_entries_enabled", "INTEGER"),
    ("today_include_previous_incomplete", "INTEGER"),
    ("today_move_completed_to_end", "INTEGER"),
    ("accent_color", "TEXT"),
)
_USERS_TABLE_COLUMNS = tuple(column for column, _ in _USERS_TABLE_SCHEMA)
_USERS_TABLE_MUTABLE_COLUMNS = tuple(
    (column, column_type)
    for column, column_type in _USERS_TABLE_SCHEMA
    if column != "id"
)


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
    credentials_error: str | None
    oauth_state: str | None
    oauth_state_created_at: datetime | None
    smart_update_interval_hours: int | None = None
    show_archived: bool | None = None
    activity_feed_sort_date: Literal["created", "modified"] | None = None
    today_entries_enabled: bool | None = None
    today_include_previous_incomplete: bool | None = None
    today_move_completed_to_end: bool | None = None
    accent_color: AccentPreference | None = None


def _row_to_record(row: Row) -> UserRecord:
    """Convert a SQLite row to a :class:`UserRecord`."""

    def _parse_timestamp(value: str | None) -> datetime | None:
        if value is None:
            return None
        return datetime.fromisoformat(value)

    def _parse_accent_color(value: str | None) -> AccentPreference | None:
        if value in ALLOWED_ACCENT_COLORS:
            return cast(AccentPreference, value)
        return None

    return UserRecord(
        id=row["id"],
        channel_id=row["channel_id"],
        channel_title=row["channel_title"],
        channel_url=row["channel_url"],
        channel_thumbnail_url=row["channel_thumbnail_url"],
        channel_updated_at=_parse_timestamp(row["channel_updated_at"]),
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
        today_move_completed_to_end=bool(row["today_move_completed_to_end"])
        if row["today_move_completed_to_end"] is not None
        else None,
        accent_color=_parse_accent_color(row["accent_color"]),
    )


class UserService(DatabaseService):
    """High-level operations for persisting YouTube user credentials."""

    @staticmethod
    def _create_users_table(connection, table_name: str = "users") -> None:
        if table_name not in {"users", "users_new"}:
            raise ValueError(f"Unsupported users table name: {table_name}")
        column_sql = ",\n                ".join(
            f"{column} {column_type}"
            for column, column_type in _USERS_TABLE_SCHEMA
        )
        connection.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {table_name} (
                {column_sql}
            )
            """
        )

    @staticmethod
    def _existing_columns(connection) -> set[str]:
        return {
            (row["name"] if isinstance(row, Row) else row[1])
            for row in connection.execute("PRAGMA table_info(users)")
        }

    def _drop_removed_columns_if_needed(
        self, connection, existing_columns: set[str]
    ) -> None:
        if not (_REMOVED_CHANNEL_PROFILE_COLUMNS & existing_columns):
            return

        self._create_users_table(connection, table_name="users_new")
        source_columns = [
            column for column in _USERS_TABLE_COLUMNS if column in existing_columns
        ]
        if source_columns:
            column_sql = ", ".join(source_columns)
            connection.execute(
                f"""
                INSERT INTO users_new ({column_sql})
                SELECT {column_sql}
                FROM users
                """
            )

        connection.execute("DROP TABLE users")
        connection.execute("ALTER TABLE users_new RENAME TO users")

    def ensure_schema(self) -> None:
        """Create the ``users`` table when it is missing."""

        with closing(self._connection_factory()) as connection:
            self._create_users_table(connection)
            existing_columns = self._existing_columns(connection)
            self._drop_removed_columns_if_needed(connection, existing_columns)
            existing_columns = self._existing_columns(connection)
            for column, column_type in _USERS_TABLE_MUTABLE_COLUMNS:
                if column in existing_columns:
                    continue
                connection.execute(
                    f"ALTER TABLE users ADD COLUMN {column} {column_type}"
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

    def get_today_move_completed_to_end(self) -> bool:
        """Return whether newly completed tasks move to the end of Today."""
        with closing(self._connection_factory()) as connection:
            row = connection.execute(
                """
                SELECT today_move_completed_to_end
                FROM users
                WHERE id = ?
                """,
                (_DEFAULT_USER_ID,),
            ).fetchone()
        if row is None or row["today_move_completed_to_end"] is None:
            return DEFAULT_TODAY_MOVE_COMPLETED_TO_END
        return bool(row["today_move_completed_to_end"])

    def set_today_move_completed_to_end(self, enabled: bool) -> None:
        """Persist whether completed Today tasks are reordered to the end."""
        with closing(self._connection_factory()) as connection:
            connection.execute(
                """
                INSERT INTO users (id, today_move_completed_to_end)
                VALUES (?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    today_move_completed_to_end=excluded.today_move_completed_to_end
                """,
                (_DEFAULT_USER_ID, int(enabled)),
            )
            connection.commit()

    def get_accent_color(self) -> AccentPreference:
        """Return the configured accent color for theming."""
        with closing(self._connection_factory()) as connection:
            row = connection.execute(
                "SELECT accent_color FROM users WHERE id = ?",
                (_DEFAULT_USER_ID,),
            ).fetchone()
        if row is None:
            return DEFAULT_ACCENT_COLOR

        value = row["accent_color"]
        if value not in ALLOWED_ACCENT_COLORS:
            return DEFAULT_ACCENT_COLOR
        return cast(AccentPreference, value)

    def set_accent_color(self, accent_color: AccentPreference) -> None:
        """Persist the configured accent color."""
        if accent_color not in ALLOWED_ACCENT_COLORS:
            raise ValueError(f"Unsupported accent color: {accent_color}")

        with closing(self._connection_factory()) as connection:
            connection.execute(
                """
                INSERT INTO users (id, accent_color)
                VALUES (?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    accent_color=excluded.accent_color
                """,
                (_DEFAULT_USER_ID, accent_color),
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
