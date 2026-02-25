"""Export Storyloop user-created content as Obsidian-friendly markdown notes."""

from __future__ import annotations

from dataclasses import dataclass, field
from io import BytesIO
import re
import sqlite3
from typing import Literal, Sequence
import zipfile

from app.db_helpers.conversations import list_turns
from app.services.entries import EntryRecord
from app.services.tags import extract_tags_from_values

_ENTRY_REFERENCE_TOKEN_PATTERN = re.compile(
    r"(?<![A-Za-z0-9_-])@entry:([A-Za-z0-9][A-Za-z0-9_-]*)(?![A-Za-z0-9_-])"
)
_ENTRY_REFERENCE_LINK_PATTERN = re.compile(
    r"\[[^\]]*]\(/entryref/([A-Za-z0-9][A-Za-z0-9_-]*)\)"
)
_INVALID_FILENAME_CHARS_PATTERN = re.compile(r'[\\/:*?"<>|\x00-\x1f]')
_WHITESPACE_PATTERN = re.compile(r"\s+")
_MAX_FILENAME_STEM_LENGTH = 120


@dataclass(slots=True)
class ConversationTurnExportRecord:
    """Serialized conversation turn data used by export generation."""

    role: str
    text: str
    created_at: str


@dataclass(slots=True)
class ConversationExportRecord:
    """Serialized conversation data used by export generation."""

    id: str
    title: str | None
    created_at: str
    turns: list[ConversationTurnExportRecord] = field(default_factory=list)


@dataclass(slots=True)
class _ExportNoteDraft:
    """In-memory representation of a markdown note before zip packaging."""

    note_id: str | None
    note_type: Literal["journal", "smart_journal", "today", "conversation"]
    title: str
    created_at: str
    updated_at: str
    raw_content: str
    tags: list[str]
    links: list[str]
    prompt: str | None = None
    file_stem: str | None = None

    @property
    def file_name(self) -> str:
        if self.file_stem is None:
            raise ValueError("file_stem must be set before reading file_name")
        return f"{self.file_stem}.md"


class _MarkdownFilenameAllocator:
    """Allocate case-insensitive, filesystem-safe markdown filenames."""

    def __init__(self) -> None:
        self._used_stems: set[str] = set()

    def reserve(self, title: str) -> str:
        base = _normalize_filename_stem(title)
        candidate = base
        suffix_index = 2
        while candidate.casefold() in self._used_stems:
            candidate = _apply_suffix(base, suffix_index)
            suffix_index += 1
        self._used_stems.add(candidate.casefold())
        return candidate


def load_conversation_export_records(
    connection: sqlite3.Connection,
) -> list[ConversationExportRecord]:
    """Load conversations and turns for content export."""

    rows = connection.execute(
        """
        SELECT id, title, created_at
        FROM conversations
        ORDER BY datetime(created_at) ASC, id ASC
        """
    ).fetchall()

    conversation_records: list[ConversationExportRecord] = []
    for row in rows:
        turns = [
            ConversationTurnExportRecord(
                role=turn["role"],
                text=turn["text"],
                created_at=turn["created_at"],
            )
            for turn in list_turns(connection, row["id"])
        ]
        conversation_records.append(
            ConversationExportRecord(
                id=row["id"],
                title=row["title"],
                created_at=row["created_at"],
                turns=turns,
            )
        )
    return conversation_records


def build_content_export_archive(
    *,
    entries: Sequence[EntryRecord],
    conversations: Sequence[ConversationExportRecord],
) -> bytes:
    """Build a zip archive containing markdown notes for user-created content."""

    notes = _build_entry_note_drafts(entries) + _build_conversation_note_drafts(
        conversations
    )
    allocator = _MarkdownFilenameAllocator()

    for note in notes:
        note.file_stem = allocator.reserve(note.title)

    entry_targets = {
        note.note_id: note.file_stem
        for note in notes
        if note.note_id is not None and note.file_stem is not None
    }

    buffer = BytesIO()
    with zipfile.ZipFile(
        buffer,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
    ) as archive:
        for note in notes:
            archive.writestr(
                note.file_name,
                _render_note_markdown(note, entry_targets),
            )
    return buffer.getvalue()


def _build_entry_note_drafts(entries: Sequence[EntryRecord]) -> list[_ExportNoteDraft]:
    relevant_entries = sorted(
        (
            entry
            for entry in entries
            if entry.category in {"journal", "today"}
        ),
        key=lambda entry: (entry.occurred_at.isoformat(), entry.id),
    )

    notes: list[_ExportNoteDraft] = []
    for entry in relevant_entries:
        is_smart_journal = entry.category == "journal" and bool(entry.prompt_body)
        note_type: Literal["journal", "smart_journal", "today", "conversation"]
        if is_smart_journal:
            note_type = "smart_journal"
        else:
            note_type = "today" if entry.category == "today" else "journal"

        tags = extract_tags_from_values(entry.title, entry.summary, entry.prompt_body)
        links = [entry.link_url] if entry.link_url else []
        notes.append(
            _ExportNoteDraft(
                note_id=entry.id,
                note_type=note_type,
                title=entry.title,
                created_at=entry.occurred_at.isoformat(),
                updated_at=entry.updated_at.isoformat(),
                raw_content=entry.summary,
                tags=tags,
                links=links,
                prompt=_build_prompt_property(entry),
            )
        )
    return notes


def _build_conversation_note_drafts(
    conversations: Sequence[ConversationExportRecord],
) -> list[_ExportNoteDraft]:
    notes: list[_ExportNoteDraft] = []
    for conversation in conversations:
        title = conversation.title or f"Conversation {conversation.id[:8]}"
        turn_text_values = [turn.text for turn in conversation.turns]
        tags = extract_tags_from_values(title, *turn_text_values)
        updated_at = (
            conversation.turns[-1].created_at
            if conversation.turns
            else conversation.created_at
        )
        notes.append(
            _ExportNoteDraft(
                note_id=None,
                note_type="conversation",
                title=title,
                created_at=conversation.created_at,
                updated_at=updated_at,
                raw_content=_render_conversation_body(conversation.turns),
                tags=tags,
                links=[],
                prompt=None,
            )
        )
    return notes


def _render_conversation_body(
    turns: Sequence[ConversationTurnExportRecord],
) -> str:
    if not turns:
        return "No turns recorded."

    sections: list[str] = []
    for turn in turns:
        role_label = turn.role.capitalize()
        content = turn.text.strip() or "_(empty message)_"
        sections.append(f"### {role_label} ({turn.created_at})\n\n{content}")
    return "\n\n".join(sections)


def _build_prompt_property(entry: EntryRecord) -> str | None:
    if not entry.prompt_body:
        return None
    if not entry.prompt_format:
        return entry.prompt_body
    return f"{entry.prompt_body}\n\nFormat guidance:\n{entry.prompt_format}"


def _render_note_markdown(
    note: _ExportNoteDraft,
    entry_targets: dict[str, str],
) -> str:
    content = _convert_storyloop_links_to_obsidian(note.raw_content, entry_targets).strip()
    sections: list[str] = []
    if content:
        sections.append(content)
    if note.links:
        link_lines = "\n".join(f"- [Source]({url})" for url in note.links)
        sections.append(f"## Links\n\n{link_lines}")
    if note.tags:
        sections.append(
            "## Tags\n\n" + " ".join(f"#{tag}" for tag in note.tags)
        )

    rendered_content = "\n\n".join(sections).strip()
    frontmatter = _render_frontmatter(note)
    if not rendered_content:
        return f"{frontmatter}\n"
    return f"{frontmatter}\n{rendered_content}\n"


def _convert_storyloop_links_to_obsidian(
    text: str,
    entry_targets: dict[str, str],
) -> str:
    converted_links = _ENTRY_REFERENCE_LINK_PATTERN.sub(
        lambda match: _to_obsidian_wikilink(
            _resolve_entry_reference_target(match.group(1), entry_targets)
        ),
        text,
    )
    return _ENTRY_REFERENCE_TOKEN_PATTERN.sub(
        lambda match: _to_obsidian_wikilink(
            _resolve_entry_reference_target(match.group(1), entry_targets)
        ),
        converted_links,
    )


def _resolve_entry_reference_target(
    entry_id: str,
    entry_targets: dict[str, str],
) -> str:
    return entry_targets.get(entry_id) or f"Entry {entry_id}"


def _to_obsidian_wikilink(target: str) -> str:
    escaped_target = target.replace("[", "").replace("]", "").replace("|", "-")
    return f"[[{escaped_target}]]"


def _render_frontmatter(note: _ExportNoteDraft) -> str:
    lines = [
        "---",
        f'storyloopType: "{_yaml_quote_scalar(note.note_type)}"',
        f'created: "{_yaml_quote_scalar(note.created_at)}"',
        f'updated: "{_yaml_quote_scalar(note.updated_at)}"',
    ]
    if note.tags:
        lines.append("tags:")
        for tag in note.tags:
            lines.append(f'  - "{_yaml_quote_scalar(tag)}"')
    if note.prompt:
        lines.append("prompt: |")
        for prompt_line in note.prompt.splitlines():
            lines.append(f"  {prompt_line}")
    lines.append("---")
    return "\n".join(lines)


def _yaml_quote_scalar(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _normalize_filename_stem(title: str) -> str:
    candidate = _INVALID_FILENAME_CHARS_PATTERN.sub("-", title)
    candidate = _WHITESPACE_PATTERN.sub(" ", candidate).strip(" .")
    if not candidate:
        candidate = "Untitled"
    if len(candidate) > _MAX_FILENAME_STEM_LENGTH:
        candidate = candidate[:_MAX_FILENAME_STEM_LENGTH].rstrip(" .")
    return candidate or "Untitled"


def _apply_suffix(base: str, suffix_index: int) -> str:
    suffix = f" {suffix_index}"
    max_base_length = max(1, _MAX_FILENAME_STEM_LENGTH - len(suffix))
    trimmed_base = base[:max_base_length].rstrip(" .")
    if not trimmed_base:
        trimmed_base = "Untitled"
    return f"{trimmed_base}{suffix}"


__all__ = [
    "ConversationExportRecord",
    "ConversationTurnExportRecord",
    "build_content_export_archive",
    "load_conversation_export_records",
]
