"""Today entry helpers and daily creation service."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import re

from app.services.entries import EntryRecord, EntryService
from app.services.users import UserService

TODAY_ENTRY_ID_PREFIX = "today-"
_DAY_KEY_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TASK_LINE_PATTERN = re.compile(r"^- \[(?P<checked>[ xX])\](?: (?P<text>.*))?$")


@dataclass(slots=True)
class TodayChecklistRow:
    """Single task row in a Today checklist."""

    text: str
    checked: bool = False


def utc_day_key(at: datetime) -> str:
    """Return the UTC day key (YYYY-MM-DD) for a timestamp."""
    if at.tzinfo is None:
        raise ValueError("Timezone-aware datetime is required.")
    return at.astimezone(UTC).date().isoformat()


def build_today_entry_id(day_key: str) -> str:
    """Build the deterministic Today entry identifier."""
    normalized = day_key.strip()
    if not _DAY_KEY_PATTERN.fullmatch(normalized):
        raise ValueError("Day key must use YYYY-MM-DD format.")
    return f"{TODAY_ENTRY_ID_PREFIX}{normalized}"


def extract_day_key_from_today_entry_id(entry_id: str) -> str | None:
    """Return day key when the id matches the today-{YYYY-MM-DD} format."""
    if not entry_id.startswith(TODAY_ENTRY_ID_PREFIX):
        return None
    day_key = entry_id[len(TODAY_ENTRY_ID_PREFIX) :]
    if not _DAY_KEY_PATTERN.fullmatch(day_key):
        return None
    return day_key


def parse_today_summary(summary: str) -> list[TodayChecklistRow]:
    """Parse canonical Today markdown into checklist rows."""
    normalized_summary = summary.replace("\r\n", "\n").replace("\r", "\n")
    if not normalized_summary.strip():
        return []

    rows: list[TodayChecklistRow] = []
    for line in normalized_summary.split("\n"):
        if not line:
            raise ValueError("Today entries do not allow blank lines.")
        match = _TASK_LINE_PATTERN.fullmatch(line)
        if match is None:
            raise ValueError("Today entries support checklist rows only.")
        checked = match.group("checked").lower() == "x"
        text = (match.group("text") or "").strip()
        rows.append(TodayChecklistRow(text=text, checked=checked))

    return rows


def serialize_today_rows(rows: list[TodayChecklistRow]) -> str:
    """Serialize checklist rows into canonical Today markdown."""
    if not rows:
        return "- [ ]"
    return "\n".join(_serialize_today_row(row) for row in rows)


def normalize_today_rows(rows: list[TodayChecklistRow]) -> list[TodayChecklistRow]:
    """Normalize rows and guarantee one trailing empty unchecked row."""
    normalized_rows = [
        TodayChecklistRow(
            text=row.text.strip(),
            checked=row.checked and bool(row.text.strip()),
        )
        for row in rows
    ]
    non_empty_rows = [row for row in normalized_rows if row.text]
    return [*non_empty_rows, TodayChecklistRow(text="", checked=False)]


def normalize_today_summary(summary: str) -> str:
    """Return canonical Today markdown or raise when input is invalid."""
    rows = parse_today_summary(summary)
    return serialize_today_rows(normalize_today_rows(rows))


def is_today_summary_empty(summary: str) -> bool:
    """Return True when the summary contains no tasks with text."""
    try:
        rows = parse_today_summary(summary)
    except ValueError:
        return False
    return not any(row.text for row in rows)


def extract_incomplete_tasks(summary: str) -> list[str]:
    """Return non-empty unchecked tasks from a Today summary."""
    rows = parse_today_summary(summary)
    return [row.text for row in rows if row.text and not row.checked]


def build_today_summary_from_tasks(tasks: list[str]) -> str:
    """Build canonical Today summary from unchecked tasks."""
    rows = [
        TodayChecklistRow(text=task.strip(), checked=False)
        for task in tasks
        if task.strip()
    ]
    return serialize_today_rows(normalize_today_rows(rows))


class TodayEntryManager:
    """Create the daily Today entry and roll over incomplete tasks."""

    def __init__(self, entry_service: EntryService, user_service: UserService) -> None:
        self._entry_service = entry_service
        self._user_service = user_service

    def ensure_today_entry(
        self, now_utc: datetime | None = None
    ) -> EntryRecord | None:
        """Create today's entry if missing, respecting feature settings."""
        if not self._user_service.get_today_entries_enabled():
            return None

        now = now_utc or datetime.now(tz=UTC)
        if now.tzinfo is None:
            raise ValueError("Timezone-aware datetime is required.")

        day_key = utc_day_key(now)
        entry_id = build_today_entry_id(day_key)
        existing = self._entry_service.get_entry(entry_id)
        if existing is not None:
            return existing

        summary = self._build_initial_summary(day_key)
        record = EntryRecord(
            id=entry_id,
            title="Today",
            summary=summary,
            prompt_body=None,
            prompt_format=None,
            occurred_at=now.astimezone(UTC),
            updated_at=now.astimezone(UTC),
            last_smart_update_at=None,
            category="today",
            link_url=None,
            thumbnail_url=None,
            video_id=None,
            pinned=False,
            archived=False,
            archived_at=None,
        )
        inserted = self._entry_service.save_new_entries([record])
        self._delete_empty_previous_today_entry(day_key)
        if inserted:
            return inserted[0]
        return self._entry_service.get_entry(entry_id)

    def _build_initial_summary(self, day_key: str) -> str:
        if not self._user_service.get_today_include_previous_incomplete():
            return build_today_summary_from_tasks([])

        previous_entry = self._find_latest_previous_today_entry(day_key)
        if previous_entry is None:
            return build_today_summary_from_tasks([])

        try:
            tasks = extract_incomplete_tasks(previous_entry.summary)
        except ValueError:
            tasks = []
        return build_today_summary_from_tasks(tasks)

    def _delete_empty_previous_today_entry(self, day_key: str) -> None:
        previous = self._find_latest_previous_today_entry(day_key)
        if previous is not None and is_today_summary_empty(previous.summary):
            self._entry_service.delete_entry(previous.id)

    def _find_latest_previous_today_entry(self, day_key: str) -> EntryRecord | None:
        previous: list[tuple[str, EntryRecord]] = []
        for record in self._entry_service.list_entries(include_archived=True):
            if record.category != "today":
                continue
            record_day_key = extract_day_key_from_today_entry_id(record.id)
            if record_day_key is None or record_day_key >= day_key:
                continue
            previous.append((record_day_key, record))

        if not previous:
            return None
        previous.sort(
            key=lambda entry: (entry[0], entry[1].updated_at),
            reverse=True,
        )
        return previous[0][1]


def _serialize_today_row(row: TodayChecklistRow) -> str:
    checked_char = "x" if row.checked else " "
    text = row.text.strip()
    if not text:
        return "- [ ]"
    return f"- [{checked_char}] {text}"


__all__ = [
    "TODAY_ENTRY_ID_PREFIX",
    "TodayChecklistRow",
    "TodayEntryManager",
    "build_today_entry_id",
    "build_today_summary_from_tasks",
    "extract_day_key_from_today_entry_id",
    "extract_incomplete_tasks",
    "is_today_summary_empty",
    "normalize_today_rows",
    "normalize_today_summary",
    "parse_today_summary",
    "serialize_today_rows",
    "utc_day_key",
]
