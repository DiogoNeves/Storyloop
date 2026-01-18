"""Tests for entry persistence helpers."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.db import SqliteConnectionFactory
from app.services.entries import EntryRecord, EntryService


def test_save_new_entries_inserts_only_fresh_records(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    service = EntryService(memory_connection_factory)
    service.ensure_schema()

    now = datetime.now(tz=UTC)
    entry_a = EntryRecord(
        id="entry-a",
        title="First journal entry",
        summary="Reflections on editing workflow.",
        occurred_at=now,
        updated_at=now,
        category="journal",
        video_id="video-123",
    )
    entry_b = EntryRecord(
        id="entry-b",
        title="Second journal entry",
        summary="Analyzed thumbnails and hooks.",
        occurred_at=now + timedelta(hours=1),
        updated_at=now + timedelta(hours=1),
        category="journal",
        link_url="https://example.com",
        thumbnail_url="https://example.com/thumb.jpg",
    )

    inserted = service.save_new_entries([entry_a])
    assert inserted == [entry_a]

    # Duplicate inserts should be ignored.
    assert service.save_new_entries([entry_a]) == []

    # Mixed batches only persist unseen entries.
    inserted_again = service.save_new_entries([entry_a, entry_b])
    assert inserted_again == [entry_b]

    with memory_connection_factory() as connection:
        rows = connection.execute("SELECT id FROM entries ORDER BY occurred_at").fetchall()
        assert [row["id"] for row in rows] == ["entry-a", "entry-b"]


def test_list_entries_returns_records_in_reverse_chronological_order(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    service = EntryService(memory_connection_factory)
    service.ensure_schema()

    now = datetime.now(tz=UTC)
    entry_earlier = EntryRecord(
        id="entry-early",
        title="Earlier entry",
        summary="Initial narrative beats.",
        occurred_at=now - timedelta(hours=1),
        updated_at=now - timedelta(hours=1),
        category="journal",
        pinned=True,
    )
    entry_latest = EntryRecord(
        id="entry-late",
        title="Latest entry",
        summary="Final retention insights.",
        occurred_at=now,
        updated_at=now,
        category="journal",
    )

    service.save_new_entries([entry_earlier, entry_latest])

    entries = service.list_entries()
    assert [entry.id for entry in entries] == ["entry-early", "entry-late"]
    assert entries[0].pinned is True


def test_get_entry_returns_record(memory_connection_factory: SqliteConnectionFactory) -> None:
    service = EntryService(memory_connection_factory)
    service.ensure_schema()

    now = datetime.now(tz=UTC)
    record = EntryRecord(
        id="entry-get",
        title="Entry to fetch",
        summary="Context for lookup.",
        occurred_at=now,
        updated_at=now,
        category="journal",
        video_id="linked-video",
    )
    service.save_new_entries([record])

    fetched = service.get_entry("entry-get")
    assert fetched is not None
    assert fetched.video_id == "linked-video"


def test_update_entry_persists_changes(memory_connection_factory: SqliteConnectionFactory) -> None:
    service = EntryService(memory_connection_factory)
    service.ensure_schema()

    now = datetime.now(tz=UTC)
    original = EntryRecord(
        id="entry-update",
        title="Original",
        summary="Original summary.",
        occurred_at=now,
        updated_at=now,
        category="journal",
    )
    service.save_new_entries([original])

    updated = EntryRecord(
        id="entry-update",
        title="Updated title",
        summary="Updated summary.",
        occurred_at=now + timedelta(days=1),
        updated_at=now + timedelta(days=1),
        category="content",
        link_url="https://example.com/content",
        video_id="vid-99",
        pinned=True,
    )

    assert service.update_entry(updated) is True

    reloaded = service.get_entry("entry-update")
    assert reloaded is not None
    assert reloaded.title == "Updated title"
    assert reloaded.category == "content"
    assert reloaded.link_url == "https://example.com/content"
    assert reloaded.video_id == "vid-99"
    assert reloaded.pinned is True


def test_delete_entry_removes_record(memory_connection_factory: SqliteConnectionFactory) -> None:
    service = EntryService(memory_connection_factory)
    service.ensure_schema()

    now = datetime.now(tz=UTC)
    record = EntryRecord(
        id="entry-delete",
        title="Delete me",
        summary="To be deleted.",
        occurred_at=now,
        updated_at=now,
        category="journal",
    )
    service.save_new_entries([record])

    assert service.delete_entry("entry-delete") is True
    assert service.get_entry("entry-delete") is None


def test_search_entries_uses_trigram_index_and_filters_category(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    service = EntryService(memory_connection_factory)
    service.ensure_schema()

    now = datetime.now(tz=UTC)
    journal_entry = EntryRecord(
        id="entry-search-journal",
        title="Retention Notes",
        summary="Testing a retention hook for the intro.",
        occurred_at=now,
        updated_at=now,
        category="journal",
    )
    content_entry = EntryRecord(
        id="entry-search-content",
        title="Video Plan",
        summary="Retention hook notes for the next upload.",
        occurred_at=now,
        updated_at=now,
        category="content",
    )
    service.save_new_entries([journal_entry, content_entry])

    results = service.search_entries(keyword="tention", category="journal", limit=10)
    assert [entry.id for entry in results] == ["entry-search-journal"]


def test_search_entries_reflects_updates_and_deletes(
    memory_connection_factory: SqliteConnectionFactory,
) -> None:
    service = EntryService(memory_connection_factory)
    service.ensure_schema()

    now = datetime.now(tz=UTC)
    record = EntryRecord(
        id="entry-search-update",
        title="Original",
        summary="Initial notes about thumbnails.",
        occurred_at=now,
        updated_at=now,
        category="journal",
    )
    service.save_new_entries([record])

    assert service.search_entries(keyword="retention", category="journal") == []

    updated = EntryRecord(
        id="entry-search-update",
        title="Updated",
        summary="Testing a thumbnail angle with retention hook.",
        occurred_at=now,
        updated_at=now,
        category="journal",
    )
    assert service.update_entry(updated) is True
    updated_results = service.search_entries(
        keyword="retention", category="journal", limit=5
    )
    assert [entry.id for entry in updated_results] == ["entry-search-update"]

    assert service.delete_entry("entry-search-update") is True
    assert service.search_entries(keyword="retention", category="journal") == []
