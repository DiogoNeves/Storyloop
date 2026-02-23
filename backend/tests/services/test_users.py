from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.db import SqliteConnectionFactory
from app.services.users import DEFAULT_ACCENT_COLOR, UserService


def test_ensure_schema_fresh_table_excludes_channel_profile_columns(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    service = UserService(memory_connection_factory)
    service.ensure_schema()

    with memory_connection_factory() as connection:
        columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(users)")
        }

    assert "channel_profile_json" not in columns
    assert "channel_profile_updated_at" not in columns
    assert "accent_color" in columns


def test_ensure_schema_migrates_legacy_channel_profile_columns(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    with memory_connection_factory() as connection:
        connection.execute(
            """
            CREATE TABLE users (
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
                today_include_previous_incomplete INTEGER,
                today_move_completed_to_end INTEGER
            )
            """
        )
        connection.execute(
            """
            INSERT INTO users (
                id,
                channel_id,
                channel_title,
                channel_url,
                channel_thumbnail_url,
                channel_updated_at,
                channel_profile_json,
                channel_profile_updated_at,
                credentials_json,
                credentials_updated_at,
                credentials_error,
                oauth_state,
                oauth_state_created_at,
                smart_update_interval_hours,
                show_archived,
                activity_feed_sort_date,
                today_entries_enabled,
                today_include_previous_incomplete,
                today_move_completed_to_end
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "active",
                "UC123",
                "Storyloop",
                "https://www.youtube.com/channel/UC123",
                "https://img.youtube.com/123.jpg",
                "2026-01-01T12:00:00+00:00",
                '{"audienceFocus":"legacy"}',
                "2026-01-01T12:00:00+00:00",
                '{"token":"abc"}',
                "2026-01-01T12:00:00+00:00",
                "credential issue",
                "oauth-state",
                "2026-01-01T11:00:00+00:00",
                6,
                1,
                "modified",
                0,
                0,
                0,
            ),
        )
        connection.commit()

    service = UserService(memory_connection_factory)
    service.ensure_schema()

    with memory_connection_factory() as connection:
        columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(users)")
        }

    assert "channel_profile_json" not in columns
    assert "channel_profile_updated_at" not in columns

    record = service.get_active_user()
    assert record is not None
    assert record.channel_id == "UC123"
    assert record.channel_title == "Storyloop"
    assert record.credentials_json == '{"token":"abc"}'
    assert record.credentials_error == "credential issue"
    assert record.oauth_state == "oauth-state"
    assert record.smart_update_interval_hours == 6
    assert record.show_archived is True
    assert record.activity_feed_sort_date == "modified"
    assert record.today_entries_enabled is False
    assert record.today_include_previous_incomplete is False
    assert record.today_move_completed_to_end is False
    assert record.accent_color is None


def test_upsert_credentials_persists_payload(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    service = UserService(memory_connection_factory)
    service.ensure_schema()

    now = datetime.now(tz=UTC).replace(microsecond=0)
    service.upsert_credentials("{\"token\": \"abc\"}", now)

    record = service.get_active_user()
    assert record is not None
    assert record.credentials_json == "{\"token\": \"abc\"}"
    assert record.credentials_updated_at is not None
    assert record.credentials_error is None

    later = now + timedelta(minutes=5)
    service.upsert_credentials("{\"token\": \"updated\"}", later)

    refreshed = service.get_active_user()
    assert refreshed is not None
    assert refreshed.credentials_json == "{\"token\": \"updated\"}"
    assert refreshed.credentials_error is None

    service.upsert_credentials(
        None, None, error_message="Stored credentials are invalid"
    )
    cleared = service.get_active_user()
    assert cleared is not None
    assert cleared.credentials_json is None
    assert cleared.credentials_error == "Stored credentials are invalid"


def test_update_channel_info_overwrites_existing_values(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    service = UserService(memory_connection_factory)
    service.ensure_schema()

    timestamp = datetime.now(tz=UTC).replace(microsecond=0)
    service.update_channel_info(
        channel_id="UC123",
        channel_title="Storyloop",
        channel_url="https://www.youtube.com/channel/UC123",
        thumbnail_url="https://img.youtube.com/123.jpg",
        updated_at=timestamp,
    )

    record = service.get_active_user()
    assert record is not None
    assert record.channel_id == "UC123"
    assert record.channel_title == "Storyloop"
    assert record.channel_url == "https://www.youtube.com/channel/UC123"
    assert record.channel_thumbnail_url == "https://img.youtube.com/123.jpg"
    assert record.channel_updated_at == timestamp

    service.update_channel_info(
        channel_id="UC999",
        channel_title="Another",
        channel_url="https://www.youtube.com/channel/UC999",
        thumbnail_url=None,
        updated_at=None,
    )

    updated = service.get_active_user()
    assert updated is not None
    assert updated.channel_id == "UC999"
    assert updated.channel_thumbnail_url is None


def test_oauth_state_round_trip(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    service = UserService(memory_connection_factory)
    service.ensure_schema()

    now = datetime.now(tz=UTC).replace(microsecond=0)
    service.save_oauth_state("state-token", now)

    record = service.get_active_user()
    assert record is not None
    assert record.oauth_state == "state-token"
    assert record.oauth_state_created_at == now

    service.clear_oauth_state()

    cleared = service.get_active_user()
    assert cleared is not None
    assert cleared.oauth_state is None
    assert cleared.oauth_state_created_at is None


def test_show_archived_round_trip(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    service = UserService(memory_connection_factory)
    service.ensure_schema()

    assert service.get_show_archived() is False

    service.set_show_archived(True)
    assert service.get_show_archived() is True

    record = service.get_active_user()
    assert record is not None
    assert record.show_archived is True

    service.set_show_archived(False)
    assert service.get_show_archived() is False


def test_activity_feed_sort_date_round_trip(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    service = UserService(memory_connection_factory)
    service.ensure_schema()

    assert service.get_activity_feed_sort_date() == "created"

    service.set_activity_feed_sort_date("modified")
    assert service.get_activity_feed_sort_date() == "modified"

    record = service.get_active_user()
    assert record is not None
    assert record.activity_feed_sort_date == "modified"

    service.set_activity_feed_sort_date("created")
    assert service.get_activity_feed_sort_date() == "created"


def test_today_entries_enabled_round_trip(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    service = UserService(memory_connection_factory)
    service.ensure_schema()

    assert service.get_today_entries_enabled() is True

    service.set_today_entries_enabled(False)
    assert service.get_today_entries_enabled() is False

    record = service.get_active_user()
    assert record is not None
    assert record.today_entries_enabled is False

    service.set_today_entries_enabled(True)
    assert service.get_today_entries_enabled() is True


def test_today_include_previous_incomplete_round_trip(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    service = UserService(memory_connection_factory)
    service.ensure_schema()

    assert service.get_today_include_previous_incomplete() is True

    service.set_today_include_previous_incomplete(False)
    assert service.get_today_include_previous_incomplete() is False

    record = service.get_active_user()
    assert record is not None
    assert record.today_include_previous_incomplete is False

    service.set_today_include_previous_incomplete(True)
    assert service.get_today_include_previous_incomplete() is True


def test_today_move_completed_to_end_round_trip(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    service = UserService(memory_connection_factory)
    service.ensure_schema()

    assert service.get_today_move_completed_to_end() is True

    service.set_today_move_completed_to_end(False)
    assert service.get_today_move_completed_to_end() is False

    record = service.get_active_user()
    assert record is not None
    assert record.today_move_completed_to_end is False

    service.set_today_move_completed_to_end(True)
    assert service.get_today_move_completed_to_end() is True


def test_accent_color_round_trip(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    service = UserService(memory_connection_factory)
    service.ensure_schema()

    assert service.get_accent_color() == DEFAULT_ACCENT_COLOR

    service.set_accent_color("azure")
    assert service.get_accent_color() == "azure"

    record = service.get_active_user()
    assert record is not None
    assert record.accent_color == "azure"

    service.set_accent_color("violet")
    assert service.get_accent_color() == "violet"


def test_invalid_persisted_accent_color_falls_back_to_default(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    service = UserService(memory_connection_factory)
    service.ensure_schema()

    with memory_connection_factory() as connection:
        connection.execute(
            """
            INSERT INTO users (id, accent_color)
            VALUES (?, ?)
            ON CONFLICT(id) DO UPDATE SET
                accent_color=excluded.accent_color
            """,
            ("active", "invalid-accent"),
        )
        connection.commit()

    assert service.get_accent_color() == DEFAULT_ACCENT_COLOR
