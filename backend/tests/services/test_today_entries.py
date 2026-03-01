"""Tests for Today checklist helpers and manager."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.db import SqliteConnectionFactory
from app.services.entries import EntryRecord, EntryService
from app.services.today_entries import (
    TodayChecklistRow,
    TodayEntryManager,
    build_today_entry_id,
    build_today_summary_from_tasks,
    extract_incomplete_tasks,
    is_today_summary_empty,
    normalize_today_summary,
    parse_today_summary,
    serialize_today_rows,
    utc_day_key,
)
from app.services.users import UserService


def test_parse_and_serialize_today_summary_round_trip() -> None:
    summary = "- [ ] Plan intro\n- [x] Upload thumbnail"
    rows = parse_today_summary(summary)

    assert rows == [
        TodayChecklistRow(text="Plan intro", checked=False),
        TodayChecklistRow(text="Upload thumbnail", checked=True),
    ]
    assert serialize_today_rows(rows) == summary


def test_normalize_today_summary_adds_trailing_empty_row() -> None:
    normalized = normalize_today_summary("- [ ] Plan hooks")

    assert normalized == "- [ ] Plan hooks\n- [ ]"


def test_extract_incomplete_tasks_ignores_completed_and_empty_rows() -> None:
    summary = "- [ ] Plan intro\n- [x] Publish\n- [ ]"

    assert extract_incomplete_tasks(summary) == ["Plan intro"]


def test_build_today_summary_from_tasks_returns_canonical_markdown() -> None:
    summary = build_today_summary_from_tasks(["  Plan intro  ", "", "Publish"])

    assert summary == "- [ ] Plan intro\n- [ ] Publish\n- [ ]"


def test_today_entry_manager_noops_when_feature_is_disabled(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    entry_service = EntryService(memory_connection_factory)
    entry_service.ensure_schema()
    user_service = UserService(memory_connection_factory)
    user_service.ensure_schema()
    user_service.set_today_entries_enabled(False)
    manager = TodayEntryManager(entry_service, user_service)
    now = datetime(2026, 2, 16, 12, 0, tzinfo=UTC)

    created = manager.ensure_today_entry(now)

    assert created is None
    assert entry_service.get_entry(build_today_entry_id(utc_day_key(now))) is None


def test_today_entry_manager_rolls_over_latest_previous_incomplete_tasks(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    entry_service = EntryService(memory_connection_factory)
    entry_service.ensure_schema()
    user_service = UserService(memory_connection_factory)
    user_service.ensure_schema()
    manager = TodayEntryManager(entry_service, user_service)
    now = datetime(2026, 2, 16, 1, 0, tzinfo=UTC)

    day_1 = now - timedelta(days=2)
    day_2 = now - timedelta(days=1)
    records = [
        EntryRecord(
            id=build_today_entry_id(utc_day_key(day_1)),
            title="Today",
            summary="- [ ] older task\n- [ ]",
            prompt_body=None,
            prompt_format=None,
            occurred_at=day_1,
            updated_at=day_1,
            last_smart_update_at=None,
            category="today",
            pinned=False,
            archived=False,
        ),
        EntryRecord(
            id=build_today_entry_id(utc_day_key(day_2)),
            title="Today",
            summary="- [x] done\n- [ ] keep this",
            prompt_body=None,
            prompt_format=None,
            occurred_at=day_2,
            updated_at=day_2 + timedelta(hours=6),
            last_smart_update_at=None,
            category="today",
            pinned=False,
            archived=False,
        ),
    ]
    entry_service.save_new_entries(records)

    created = manager.ensure_today_entry(now)

    assert created is not None
    assert created.id == build_today_entry_id(utc_day_key(now))
    assert created.summary == "- [ ] keep this\n- [ ]"


def test_today_entry_manager_rolls_over_from_latest_prior_day_key(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    entry_service = EntryService(memory_connection_factory)
    entry_service.ensure_schema()
    user_service = UserService(memory_connection_factory)
    user_service.ensure_schema()
    manager = TodayEntryManager(entry_service, user_service)
    now = datetime(2026, 2, 16, 1, 0, tzinfo=UTC)

    older_day = now - timedelta(days=3)
    latest_previous_day = now - timedelta(days=1)
    records = [
        EntryRecord(
            id=build_today_entry_id(utc_day_key(older_day)),
            title="Today",
            summary="- [ ] stale task\n- [ ]",
            prompt_body=None,
            prompt_format=None,
            occurred_at=older_day,
            # Deliberately newer updated_at than yesterday to ensure day-key order wins.
            updated_at=now + timedelta(hours=1),
            last_smart_update_at=None,
            category="today",
            pinned=False,
            archived=False,
        ),
        EntryRecord(
            id=build_today_entry_id(utc_day_key(latest_previous_day)),
            title="Today",
            summary="- [ ] yesterday task",
            prompt_body=None,
            prompt_format=None,
            occurred_at=latest_previous_day,
            updated_at=latest_previous_day,
            last_smart_update_at=None,
            category="today",
            pinned=False,
            archived=False,
        ),
    ]
    entry_service.save_new_entries(records)

    created = manager.ensure_today_entry(now)

    assert created is not None
    assert created.id == build_today_entry_id(utc_day_key(now))
    assert created.summary == "- [ ] yesterday task\n- [ ]"


def test_today_entry_manager_is_idempotent(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    entry_service = EntryService(memory_connection_factory)
    entry_service.ensure_schema()
    user_service = UserService(memory_connection_factory)
    user_service.ensure_schema()
    manager = TodayEntryManager(entry_service, user_service)
    now = datetime(2026, 2, 16, 1, 0, tzinfo=UTC)

    first = manager.ensure_today_entry(now)
    second = manager.ensure_today_entry(now)

    assert first is not None
    assert second is not None
    assert first.id == second.id
    assert [entry.id for entry in entry_service.list_entries()] == [first.id]


def test_is_today_summary_empty_single_unchecked_row() -> None:
    assert is_today_summary_empty("- [ ]") is True


def test_is_today_summary_empty_with_text() -> None:
    assert is_today_summary_empty("- [ ] Plan intro\n- [ ]") is False


def test_is_today_summary_empty_only_empty_rows() -> None:
    assert is_today_summary_empty("- [ ]\n- [ ]") is True


def test_is_today_summary_empty_blank_string() -> None:
    assert is_today_summary_empty("") is True


def test_is_today_summary_empty_checked_with_text() -> None:
    assert is_today_summary_empty("- [x] Done\n- [ ]") is False


def test_today_entry_manager_deletes_empty_previous_entry_on_rollover(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    entry_service = EntryService(memory_connection_factory)
    entry_service.ensure_schema()
    user_service = UserService(memory_connection_factory)
    user_service.ensure_schema()
    manager = TodayEntryManager(entry_service, user_service)
    now = datetime(2026, 2, 16, 1, 0, tzinfo=UTC)

    yesterday = now - timedelta(days=1)
    yesterday_id = build_today_entry_id(utc_day_key(yesterday))
    entry_service.save_new_entries(
        [
            EntryRecord(
                id=yesterday_id,
                title="Today",
                summary="- [ ]",
                prompt_body=None,
                prompt_format=None,
                occurred_at=yesterday,
                updated_at=yesterday,
                last_smart_update_at=None,
                category="today",
                pinned=False,
                archived=False,
            ),
        ]
    )

    manager.ensure_today_entry(now)

    assert entry_service.get_entry(yesterday_id) is None


def test_today_entry_manager_keeps_non_empty_previous_entry_on_rollover(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    entry_service = EntryService(memory_connection_factory)
    entry_service.ensure_schema()
    user_service = UserService(memory_connection_factory)
    user_service.ensure_schema()
    manager = TodayEntryManager(entry_service, user_service)
    now = datetime(2026, 2, 16, 1, 0, tzinfo=UTC)

    yesterday = now - timedelta(days=1)
    yesterday_id = build_today_entry_id(utc_day_key(yesterday))
    entry_service.save_new_entries(
        [
            EntryRecord(
                id=yesterday_id,
                title="Today",
                summary="- [x] Done\n- [ ]",
                prompt_body=None,
                prompt_format=None,
                occurred_at=yesterday,
                updated_at=yesterday,
                last_smart_update_at=None,
                category="today",
                pinned=False,
                archived=False,
            ),
        ]
    )

    manager.ensure_today_entry(now)

    assert entry_service.get_entry(yesterday_id) is not None
