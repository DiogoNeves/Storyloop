"""YouTube identifier parsing and resolution utilities.

This module handles parsing various YouTube identifier formats (URLs, handles,
channel IDs, usernames) and building lookup candidates for channel resolution.

Scope:
- URL parsing and identifier extraction
- Lookup candidate generation
- Identifier validation and normalization

Out of scope:
- API communication (handled by YoutubeService)
- Channel resolution logic (handled by YoutubeService)
- Data model definitions (handled by youtube.py)
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal
from urllib.parse import parse_qs, urlparse

from collections.abc import Iterable

CHANNEL_ID_PATTERN = re.compile(r"^UC[0-9A-Za-z_-]{22}$")


@dataclass(slots=True)
class LookupCandidate:
    """Represents a single lookup attempt against the YouTube API."""

    endpoint: Literal["channels", "video"]
    params: dict[str, str]


@dataclass(slots=True)
class UrlIdentifierHints:
    """Structured hints extracted from a potential YouTube URL."""

    channel_ids: list[str]
    handles: list[str]
    usernames: list[str]
    video_ids: list[str]


def clean_handle(value: str) -> str:
    """Strip the leading @ from handle-like identifiers."""
    return value[1:] if value.startswith("@") else value


def collect_url_hints(identifier: str) -> UrlIdentifierHints | None:
    """Extract structured lookup hints from a potential YouTube URL."""
    try:
        parsed = urlparse(identifier)
    except ValueError:
        return None

    if not parsed.scheme or not parsed.netloc:
        return None

    netloc = parsed.netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    path_segments = [segment for segment in parsed.path.split("/") if segment]
    query = parse_qs(parsed.query)

    hints = UrlIdentifierHints(
        channel_ids=[],
        handles=[],
        usernames=[],
        video_ids=[],
    )

    def add_channel_id(value: str) -> None:
        trimmed = value.strip()
        if trimmed:
            hints.channel_ids.append(trimmed)

    def add_username(value: str) -> None:
        trimmed = value.strip()
        if trimmed:
            hints.usernames.append(trimmed)

    def add_handle(value: str) -> None:
        trimmed = value.strip()
        if trimmed:
            hints.handles.append(clean_handle(trimmed))

    def add_video_id(value: str) -> None:
        trimmed = value.strip()
        if trimmed:
            hints.video_ids.append(trimmed)

    for value in query.get("channel_id", []):
        add_channel_id(value)
    for key in ("user", "c"):
        for value in query.get(key, []):
            add_username(value)
    for value in query.get("handle", []):
        add_handle(value)
    for value in query.get("v", []):
        add_video_id(value)
    for value in query.get("video_id", []):
        add_video_id(value)

    if netloc.endswith("youtu.be") and path_segments:
        add_video_id(path_segments[0])
        return hints

    if path_segments:
        first = path_segments[0]
        if first.startswith("@"):
            add_handle(first)
        elif first == "channel" and len(path_segments) > 1:
            add_channel_id(path_segments[1])
        elif first in {"user", "c"} and len(path_segments) > 1:
            username = path_segments[1]
            add_username(username)
            add_handle(username)
        elif first == "shorts" and len(path_segments) > 1:
            add_video_id(path_segments[1])
        else:
            last_segment = path_segments[-1]
            if last_segment.startswith("@"):
                add_handle(last_segment)
            elif last_segment not in {"watch", "shorts", "videos", "live"}:
                add_username(last_segment)
                add_handle(last_segment)

    return hints


def unique_strings(values: Iterable[str]) -> list[str]:
    """Deduplicate strings while preserving order."""
    seen: set[str] = set()
    unique: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        unique.append(value)
    return unique


def unique_dicts(candidates: Iterable[dict[str, str]]) -> list[dict[str, str]]:
    """Deduplicate dictionaries while preserving order."""
    seen: set[tuple[tuple[str, str], ...]] = set()
    unique: list[dict[str, str]] = []
    for candidate in candidates:
        key = tuple(sorted(candidate.items()))
        if key in seen:
            continue
        seen.add(key)
        unique.append(candidate)
    return unique


def build_lookup_candidates(identifier: str) -> list[LookupCandidate]:
    """Construct ordered lookup attempts for a channel identifier."""
    cleaned = identifier.strip()
    if not cleaned:
        return []

    url_hints = collect_url_hints(cleaned) if "://" in cleaned else None

    channel_ids: list[str] = []
    handles: list[str] = []
    usernames: list[str] = []
    video_ids: list[str] = []

    if url_hints:
        channel_ids.extend(url_hints.channel_ids)
        handles.extend(url_hints.handles)
        usernames.extend(url_hints.usernames)
        video_ids.extend(url_hints.video_ids)

    if CHANNEL_ID_PATTERN.fullmatch(cleaned):
        channel_ids.insert(0, cleaned)
    elif not url_hints:
        if cleaned.startswith("@"):
            handles.append(clean_handle(cleaned))
        else:
            handles.append(clean_handle(cleaned))
            usernames.append(cleaned)

    channel_candidates: list[dict[str, str]] = []
    for channel_id in unique_strings(channel_ids):
        channel_candidates.append({"id": channel_id})
    for handle in unique_strings(handles):
        channel_candidates.append({"forHandle": handle})
    for username in unique_strings(usernames):
        channel_candidates.append({"forUsername": username})

    candidates: list[LookupCandidate] = [
        LookupCandidate(endpoint="channels", params=params)
        for params in unique_dicts(channel_candidates)
    ]

    seen_video_ids: set[str] = set()
    for video_id in video_ids:
        video_id = video_id.strip()
        if not video_id or video_id in seen_video_ids:
            continue
        seen_video_ids.add(video_id)
        candidates.append(
            LookupCandidate(endpoint="video", params={"id": video_id})
        )

    return candidates

