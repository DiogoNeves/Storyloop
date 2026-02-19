from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.db import SqliteConnectionFactory
from app.services.users import UserService


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
