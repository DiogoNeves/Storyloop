"""Tests for markdown export archive generation."""

from __future__ import annotations

from datetime import UTC, datetime
import io
import zipfile

from app.services.content_export import (
    ConversationExportRecord,
    ConversationTurnExportRecord,
    build_content_export_archive,
)
from app.services.entries import EntryRecord


def test_build_content_export_archive_renders_obsidian_markdown() -> None:
    journal_entry = EntryRecord(
        id="journal-1",
        title="Journal/One",
        summary=(
            "Review @entry:today-1 and [Roadmap \\[Draft\\]](/entryref/today-1). #alpha"
        ),
        occurred_at=datetime(2026, 2, 1, 10, 0, tzinfo=UTC),
        updated_at=datetime(2026, 2, 3, 9, 30, tzinfo=UTC),
        category="journal",
        prompt_body="Summarize wins with #focus.",
        prompt_format="Use short bullets.",
    )
    today_entry = EntryRecord(
        id="today-1",
        title="Today",
        summary="- [ ] Follow up with @entry:journal-1 #today",
        occurred_at=datetime(2026, 2, 2, 8, 0, tzinfo=UTC),
        updated_at=datetime(2026, 2, 2, 18, 0, tzinfo=UTC),
        category="today",
        link_url="https://example.com/today-link",
    )
    content_entry = EntryRecord(
        id="video-1",
        title="Video import",
        summary="Imported video content should not export.",
        occurred_at=datetime(2026, 2, 1, 8, 0, tzinfo=UTC),
        updated_at=datetime(2026, 2, 1, 8, 0, tzinfo=UTC),
        category="content",
    )
    conversation = ConversationExportRecord(
        id="conv-1",
        title="Weekly Sync #ops",
        created_at="2026-02-04T11:00:00+00:00",
        turns=[
            ConversationTurnExportRecord(
                role="user",
                text="Can you check @entry:journal-1?",
                created_at="2026-02-04T11:01:00+00:00",
            ),
            ConversationTurnExportRecord(
                role="assistant",
                text="Start with [Journal](/entryref/journal-1) #chat.",
                created_at="2026-02-04T11:02:00+00:00",
            ),
        ],
    )

    archive_bytes = build_content_export_archive(
        entries=[journal_entry, today_entry, content_entry],
        conversations=[conversation],
    )

    archive = zipfile.ZipFile(io.BytesIO(archive_bytes))
    names = archive.namelist()
    assert len(names) == 3
    assert len(set(names)) == 3
    assert all(name.endswith(".md") for name in names)
    assert all("/" not in name for name in names)

    markdown_by_name = {
        name: archive.read(name).decode("utf-8")
        for name in names
    }
    assert not any("Video import" in markdown for markdown in markdown_by_name.values())

    smart_markdown = next(
        markdown
        for markdown in markdown_by_name.values()
        if 'storyloopType: "smart_journal"' in markdown
    )
    assert 'created: "2026-02-01T10:00:00+00:00"' in smart_markdown
    assert 'updated: "2026-02-03T09:30:00+00:00"' in smart_markdown
    assert "prompt: |" in smart_markdown
    assert "@entry:" not in smart_markdown
    assert "/entryref/" not in smart_markdown
    assert "[[" in smart_markdown
    assert "## Tags" in smart_markdown
    assert "#focus" in smart_markdown

    today_markdown = next(
        markdown
        for markdown in markdown_by_name.values()
        if 'storyloopType: "today"' in markdown
    )
    assert "## Links" in today_markdown
    assert "https://example.com/today-link" in today_markdown
    assert "## Tags" in today_markdown
    assert "#today" in today_markdown

    conversation_markdown = next(
        markdown
        for markdown in markdown_by_name.values()
        if 'storyloopType: "conversation"' in markdown
    )
    assert "### User (2026-02-04T11:01:00+00:00)" in conversation_markdown
    assert "### Assistant (2026-02-04T11:02:00+00:00)" in conversation_markdown
    assert "@entry:" not in conversation_markdown
    assert "/entryref/" not in conversation_markdown
    assert "## Tags" in conversation_markdown
    assert "#ops" in conversation_markdown


def test_build_content_export_archive_uses_unique_filename_suffixes() -> None:
    first_today = EntryRecord(
        id="today-1",
        title="Today",
        summary="- [ ] one",
        occurred_at=datetime(2026, 2, 5, 8, 0, tzinfo=UTC),
        updated_at=datetime(2026, 2, 5, 9, 0, tzinfo=UTC),
        category="today",
    )
    second_today = EntryRecord(
        id="today-2",
        title="Today",
        summary="- [ ] two",
        occurred_at=datetime(2026, 2, 6, 8, 0, tzinfo=UTC),
        updated_at=datetime(2026, 2, 6, 9, 0, tzinfo=UTC),
        category="today",
    )

    archive_bytes = build_content_export_archive(
        entries=[first_today, second_today],
        conversations=[],
    )
    archive = zipfile.ZipFile(io.BytesIO(archive_bytes))
    names = archive.namelist()

    assert len(names) == 2
    assert len(set(names)) == 2
    assert names[0].startswith("Today")
    assert names[1].startswith("Today")
