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
async def test_search_entries_excludes_explicitly_archived_entries(
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
                summary="Newest note retention",
                occurred_at=now,
                updated_at=now,
                category="journal",
                archived=True,
            ),
            EntryRecord(
                id="entry-archived-second",
                title="Retention draft",
                summary="Second newest retention",
                occurred_at=now - timedelta(minutes=1),
                updated_at=now - timedelta(minutes=1),
                category="journal",
                archived=True,
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
async def test_hashtag_text_does_not_control_archive_visibility(
    memory_connection_factory,
) -> None:
    service = EntryService(memory_connection_factory)
    service.ensure_schema()

    now = datetime.now(tz=UTC)
    service.save_new_entries(
        [
            EntryRecord(
                id="entry-tag-active",
                title="Retention notes",
                summary="Investigating #archived retention trends",
                occurred_at=now,
                updated_at=now,
                category="journal",
                archived=False,
            ),
            EntryRecord(
                id="entry-tag-archived",
                title="Retention archive",
                summary="Archived entry",
                occurred_at=now - timedelta(minutes=1),
                updated_at=now - timedelta(minutes=1),
                category="journal",
                archived=True,
            ),
        ]
    )

    repo = JournalRepository(service)
    search_results = await repo.search_entries(
        user_id="user-1",
        keyword="retention",
        limit=10,
    )
    archived_keyword_results = await repo.search_entries(
        user_id="user-1",
        keyword="archived",
        limit=10,
    )

    assert [entry.id for entry in search_results] == ["entry-tag-active"]
    assert [entry.id for entry in archived_keyword_results] == [
        "entry-tag-active"
    ]
    assert (await repo.get_entry("entry-tag-active")).id == "entry-tag-active"
    with pytest.raises(RuntimeError, match="Entry is archived"):
        await repo.get_entry("entry-tag-archived")
