from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.services.agent_tools.repositories import TodayRepository
from app.services.entries import EntryRecord, EntryService


@pytest.mark.asyncio
async def test_load_today_entries_returns_completion_breakdown(
    memory_connection_factory,
) -> None:
    service = EntryService(memory_connection_factory)
    service.ensure_schema()
    now = datetime(2026, 2, 16, 12, 0, tzinfo=UTC)
    older = now - timedelta(days=1)
    service.save_new_entries(
        [
            EntryRecord(
                id="today-2026-02-16",
                title="Today",
                summary="- [x] Publish weekly video\n- [ ] Plan next hook\n- [ ]",
                occurred_at=now,
                updated_at=now,
                category="today",
                archived=False,
            ),
            EntryRecord(
                id="today-2026-02-15",
                title="Today",
                summary="- [x] Draft outline\n- [x] Record intro\n- [ ]",
                occurred_at=older,
                updated_at=older,
                category="today",
                archived=False,
            ),
            EntryRecord(
                id="journal-1",
                title="Journal",
                summary="Should not be included",
                occurred_at=now,
                updated_at=now,
                category="journal",
                archived=False,
            ),
        ]
    )

    repo = TodayRepository(service)
    entries = await repo.load_entries(user_id="user-1", limit=10, before=None)

    assert [entry.id for entry in entries] == [
        "today-2026-02-16",
        "today-2026-02-15",
    ]
    assert entries[0].completed_tasks == ["Publish weekly video"]
    assert entries[0].pending_tasks == ["Plan next hook"]
    assert [item.text for item in entries[0].checklist] == [
        "Publish weekly video",
        "Plan next hook",
    ]


@pytest.mark.asyncio
async def test_load_today_entries_respects_before_filter(
    memory_connection_factory,
) -> None:
    service = EntryService(memory_connection_factory)
    service.ensure_schema()
    now = datetime(2026, 2, 16, 12, 0, tzinfo=UTC)
    older = now - timedelta(days=1)
    service.save_new_entries(
        [
            EntryRecord(
                id="today-2026-02-16",
                title="Today",
                summary="- [x] Publish\n- [ ]",
                occurred_at=now,
                updated_at=now,
                category="today",
                archived=False,
            ),
            EntryRecord(
                id="today-2026-02-15",
                title="Today",
                summary="- [ ] Plan",
                occurred_at=older,
                updated_at=older,
                category="today",
                archived=False,
            ),
        ]
    )

    repo = TodayRepository(service)
    entries = await repo.load_entries(
        user_id="user-1",
        limit=10,
        before="2026-02-16T00:00:00+00:00",
    )

    assert [entry.id for entry in entries] == ["today-2026-02-15"]


@pytest.mark.asyncio
async def test_load_today_entries_handles_invalid_summary(
    memory_connection_factory,
) -> None:
    service = EntryService(memory_connection_factory)
    service.ensure_schema()
    now = datetime(2026, 2, 16, 12, 0, tzinfo=UTC)
    service.save_new_entries(
        [
            EntryRecord(
                id="today-2026-02-16",
                title="Today",
                summary="free-form progress note",
                occurred_at=now,
                updated_at=now,
                category="today",
                archived=False,
            )
        ]
    )

    repo = TodayRepository(service)
    entries = await repo.load_entries(user_id="user-1", limit=10, before=None)

    assert len(entries) == 1
    assert entries[0].checklist == []
    assert entries[0].completed_tasks == []
    assert entries[0].pending_tasks == []
