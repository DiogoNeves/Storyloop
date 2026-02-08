from __future__ import annotations

from datetime import UTC, datetime, timedelta
from hashlib import blake2s

import pytest

from app.services.agent_tools.repositories import JournalRepository
from app.services.agent_tools.models import JournalEntryInput
from app.services.entries import EntryRecord, EntryService


def _content_hash(title: str, summary: str) -> str:
    payload = f"{title.strip()}\n{summary.strip()}".encode("utf-8")
    return blake2s(payload).hexdigest()[:12]


@pytest.mark.asyncio
async def test_read_journal_entry_returns_content_hash(
    memory_connection_factory,
) -> None:
    service = EntryService(memory_connection_factory)
    service.ensure_schema()
    record = EntryRecord(
        id="entry-1",
        title="  Trimmed title  ",
        summary="  Trimmed summary  ",
        occurred_at=datetime.now(tz=UTC),
        updated_at=datetime.now(tz=UTC),
        category="journal",
    )
    service.save_new_entries([record])

    repo = JournalRepository(service)
    entry = await repo.get_entry("entry-1")

    assert entry.content_hash == _content_hash(record.title, record.summary)
    assert len(entry.content_hash) == 12


@pytest.mark.asyncio
async def test_edit_journal_entry_requires_matching_hash(
    memory_connection_factory,
) -> None:
    service = EntryService(memory_connection_factory)
    service.ensure_schema()
    record = EntryRecord(
        id="entry-2",
        title="Original",
        summary="Original summary",
        occurred_at=datetime.now(tz=UTC),
        updated_at=datetime.now(tz=UTC),
        category="journal",
    )
    service.save_new_entries([record])

    repo = JournalRepository(service)
    payload = JournalEntryInput(
        title="Updated",
        content_markdown="Updated summary",
    )

    with pytest.raises(RuntimeError, match="must read again before editing"):
        await repo.update_entry("entry-2", payload, content_hash="deadbeef")


@pytest.mark.asyncio
async def test_edit_journal_entry_updates_content_and_hash(
    memory_connection_factory,
) -> None:
    service = EntryService(memory_connection_factory)
    service.ensure_schema()
    record = EntryRecord(
        id="entry-3",
        title="Original",
        summary="Original summary",
        occurred_at=datetime.now(tz=UTC),
        updated_at=datetime.now(tz=UTC),
        category="journal",
    )
    service.save_new_entries([record])

    repo = JournalRepository(service)
    current = await repo.get_entry("entry-3")
    payload = JournalEntryInput(
        title="Updated",
        content_markdown="Updated summary",
    )
    updated = await repo.update_entry("entry-3", payload, current.content_hash)

    assert updated.title == "Updated"
    assert updated.content_markdown == "Updated summary"
    assert updated.content_hash != current.content_hash


@pytest.mark.asyncio
async def test_create_journal_entry_strips_text(
    memory_connection_factory,
) -> None:
    service = EntryService(memory_connection_factory)
    service.ensure_schema()

    repo = JournalRepository(service)
    payload = JournalEntryInput(
        title="  New title  ",
        content_markdown="  New summary  ",
    )
    entry = await repo.create_entry(payload)

    assert entry.title == "New title"
    assert entry.content_markdown == "New summary"


@pytest.mark.asyncio
async def test_search_entries_refills_limit_after_archived_filtering(
    memory_connection_factory,
) -> None:
    service = EntryService(memory_connection_factory)
    service.ensure_schema()

    now = datetime.now(tz=UTC)
    service.save_new_entries(
        [
            EntryRecord(
                id="entry-archived-newest",
                title="Retention update",
                summary="Newest note #archived retention",
                occurred_at=now,
                updated_at=now,
                category="journal",
            ),
            EntryRecord(
                id="entry-archived-second",
                title="Retention draft",
                summary="Second newest #archived retention",
                occurred_at=now - timedelta(minutes=1),
                updated_at=now - timedelta(minutes=1),
                category="journal",
            ),
            EntryRecord(
                id="entry-visible-first",
                title="Retention experiment",
                summary="Visible retention result",
                occurred_at=now - timedelta(minutes=2),
                updated_at=now - timedelta(minutes=2),
                category="journal",
            ),
            EntryRecord(
                id="entry-visible-second",
                title="Retention follow-up",
                summary="Another visible retention note",
                occurred_at=now - timedelta(minutes=3),
                updated_at=now - timedelta(minutes=3),
                category="journal",
            ),
        ]
    )

    repo = JournalRepository(service)
    results = await repo.search_entries(user_id="user-1", keyword="retention", limit=2)

    assert [entry.id for entry in results] == [
        "entry-visible-first",
        "entry-visible-second",
    ]


@pytest.mark.asyncio
async def test_archived_detection_requires_exact_hashtag_match(
    memory_connection_factory,
) -> None:
    service = EntryService(memory_connection_factory)
    service.ensure_schema()

    now = datetime.now(tz=UTC)
    service.save_new_entries(
        [
            EntryRecord(
                id="entry-tag-suffix",
                title="Retention notes",
                summary="Investigating #archived2024 retention trends",
                occurred_at=now,
                updated_at=now,
                category="journal",
            ),
            EntryRecord(
                id="entry-tag-hyphen",
                title="Retention ideas #archived-notes",
                summary="Should stay visible",
                occurred_at=now - timedelta(minutes=1),
                updated_at=now - timedelta(minutes=1),
                category="journal",
            ),
            EntryRecord(
                id="entry-tag-exact",
                title="Retention archive",
                summary="Archived entry #archived",
                occurred_at=now - timedelta(minutes=2),
                updated_at=now - timedelta(minutes=2),
                category="journal",
            ),
        ]
    )

    repo = JournalRepository(service)
    search_results = await repo.search_entries(
        user_id="user-1",
        keyword="retention",
        limit=10,
    )

    assert [entry.id for entry in search_results] == [
        "entry-tag-suffix",
        "entry-tag-hyphen",
    ]
    assert (await repo.get_entry("entry-tag-suffix")).id == "entry-tag-suffix"
    assert (await repo.get_entry("entry-tag-hyphen")).id == "entry-tag-hyphen"
    with pytest.raises(RuntimeError, match="Entry is archived"):
        await repo.get_entry("entry-tag-exact")
