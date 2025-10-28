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
        category="journal",
    )
    entry_b = EntryRecord(
        id="entry-b",
        title="Second journal entry",
        summary="Analyzed thumbnails and hooks.",
        occurred_at=now + timedelta(hours=1),
        category="journal",
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
